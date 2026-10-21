import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createZip, readZip, crc32 } from "../../scripts/lib/zip.mjs";
import { buildPackages, checkOutDir, OUTPUT_MARKER, resolveOutDir } from "../../scripts/package.mjs";
import { loadRepository } from "../../scripts/lib/repo-model.mjs";
import { REPO_ROOT } from "../../scripts/lib/constants.mjs";

test("zip: CRC-32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("zip: round trip keeps names, folders, text, binary data, and is byte-for-byte reproducible", () => {
  const files = [
    { path: "skill/SKILL.md", data: "---\nname: skill\n---\n# Überblick\n".repeat(20) },
    { path: "skill/references/a.md", data: "x" },
    { path: "skill/assets/logo.bin", data: Buffer.from([0, 255, 1, 254, 2, 253]) },
  ];
  const zip = createZip(files);
  assert.deepEqual(zip, createZip([...files].reverse()), "input order must not change the bytes");
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.path), ["skill/", "skill/SKILL.md", "skill/assets/", "skill/assets/logo.bin", "skill/references/", "skill/references/a.md"]);
  for (const f of files) assert.deepEqual(entries.find((e) => e.path === f.path).data, Buffer.from(f.data));
  assert.throws(() => createZip([{ path: "../evil.md", data: "x" }]), /Unsafe/);
});

test("package: one ZIP per skill and plugin, each skill in one folder named after it, checksums match", () => {
  const out = mkdtempSync(join(tmpdir(), "fa-pkg-"));
  try {
    const { written } = buildPackages({ outDir: out, version: "v0.0.0-test" });
    const model = loadRepository();
    const license = readFileSync(join(REPO_ROOT, "LICENSE"));
    const skills = model.plugins.filter((p) => p.source).flatMap((p) => p.skills.filter((s) => s.data));
    for (const s of skills) {
      const entries = readZip(readFileSync(join(out, "skills", `${s.data.name}.zip`)));
      const top = new Set(entries.map((e) => e.path.split("/")[0]));
      assert.deepEqual([...top], [s.data.name], `${s.data.name}.zip must contain exactly one top-level folder`);
      for (const rel of s.files) {
        const entry = entries.find((e) => e.path === `${s.data.name}/${rel}`);
        assert.ok(entry, `${s.data.name}.zip is missing ${rel}`);
        assert.deepEqual(entry.data, readFileSync(join(s.dir, rel)), `${rel} differs from the source`);
      }
      assert.deepEqual(entries.find((e) => e.path === `${s.data.name}/LICENSE.txt`)?.data, license, `${s.data.name}.zip must include the repository LICENSE as LICENSE.txt`);
    }
    const all = readZip(readFileSync(join(out, "all-skills.zip")));
    assert.deepEqual(new Set(all.map((e) => e.path.split("/")[0])), new Set(skills.map((s) => s.data.name)));
    for (const s of skills) assert.ok(all.some((e) => e.path === `${s.data.name}/LICENSE.txt`), `all-skills.zip: ${s.data.name}/LICENSE.txt`);
    for (const p of model.plugins.filter((x) => x.source)) {
      const entries = readZip(readFileSync(join(out, "plugins", `plugin-${p.source.name}.zip`)));
      assert.ok(entries.some((e) => e.path === `${p.source.name}/.claude-plugin/plugin.json`), `${p.source.name}.zip lacks its Claude manifest`);
      assert.ok(entries.some((e) => e.path === `${p.source.name}/plugin.json`), `${p.source.name}.zip lacks its Agent Plugins manifest`);
      assert.deepEqual(entries.find((e) => e.path === `${p.source.name}/LICENSE.txt`)?.data, license, `plugin-${p.source.name}.zip must include LICENSE.txt`);
    }
    const sums = readFileSync(join(out, "SHA256SUMS.txt"), "utf8").trim().split("\n");
    assert.equal(sums.length, written.length);
    for (const w of written) {
      const digest = createHash("sha256").update(readFileSync(join(out, w.relPath))).digest("hex");
      assert.ok(sums.includes(`${digest}  ${w.relPath.split("/").pop()}`), `checksum line for ${w.relPath}`);
    }
    const notes = readFileSync(join(out, "RELEASE_NOTES.md"), "utf8");
    assert.match(notes, /#download-skills-as-zip-files/, "release notes link to the README download section");
    assert.match(notes, /sha256sum -c --ignore-missing SHA256SUMS\.txt/, "a single download must verify on Linux");
    assert.match(notes, /shasum -a 256 -c --ignore-missing SHA256SUMS\.txt/, "a single download must verify on macOS");
    assert.match(notes, /Not affiliated with, sponsored by, or endorsed by SAP, /);
    assert.match(notes, /MIT License; each archive includes LICENSE\.txt/);
    // The marker lets the next run clean this folder; it is never a release asset.
    assert.ok(existsSync(join(out, OUTPUT_MARKER)));
    assert.equal(checkOutDir(out), resolve(out));
    // Two builds of the same sources produce identical archives.
    const again = buildPackages({ outDir: join(out, "again") });
    for (const w of written) assert.equal(again.written.find((x) => x.relPath === w.relPath).sha256, w.sha256, `${w.relPath} is not reproducible`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

// The guard tests below use temporary folders only, so a broken guard cannot delete anything
// real. checkOutDir only reads, which is why it can be pointed at the repository itself.

test("package: never deletes a non-empty folder it did not create", () => {
  const foreign = mkdtempSync(join(tmpdir(), "fa-guard-"));
  try {
    writeFileSync(join(foreign, "keep.txt"), "x");
    mkdirSync(join(foreign, "skills"));
    writeFileSync(join(foreign, "skills", "mine.md"), "y");
    assert.throws(() => buildPackages({ outDir: foreign }), /Refusing to delete/);
    assert.ok(existsSync(join(foreign, "keep.txt")), "keep.txt must survive");
    assert.ok(existsSync(join(foreign, "skills", "mine.md")), "an existing skills/ folder must survive");
    assert.deepEqual(readdirSync(foreign).sort(), ["keep.txt", "skills"], "nothing may be added either");
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("package: the output guard refuses the repository, its parents, drive roots, and files", () => {
  assert.throws(() => checkOutDir(REPO_ROOT), /Refusing to delete/);
  assert.throws(() => checkOutDir(dirname(REPO_ROOT)), /Refusing to delete/);
  assert.throws(() => checkOutDir(parse(REPO_ROOT).root), /Refusing to delete/);
  assert.throws(() => checkOutDir(join(REPO_ROOT, "plugins")), /Refusing to delete/);
  assert.throws(() => checkOutDir(join(REPO_ROOT, "package.json")), /is a file/);
  assert.equal(checkOutDir(join(REPO_ROOT, "dist")), join(REPO_ROOT, "dist"), "the default output folder is always allowed");
  const tmp = mkdtempSync(join(tmpdir(), "fa-guard-"));
  try {
    assert.equal(checkOutDir(tmp), resolve(tmp), "an empty folder is allowed");
    assert.equal(checkOutDir(join(tmp, "new")), resolve(tmp, "new"), "a folder that does not exist is allowed");
    writeFileSync(join(tmp, "old.zip"), "x");
    assert.throws(() => checkOutDir(tmp), /not created by npm run package/);
    writeFileSync(join(tmp, OUTPUT_MARKER), "x");
    assert.equal(checkOutDir(tmp), resolve(tmp), "a folder with the marker of an earlier run is allowed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("package: --out resolves against the folder npm was started from, and absolute paths stay absolute", () => {
  const base = join(tmpdir(), "fa-base");
  assert.equal(resolveOutDir("pkg", base), join(base, "pkg"));
  assert.equal(resolveOutDir(".", base), resolve(base));
  const absolute = join(tmpdir(), "fa-abs", "pkg");
  assert.ok(isAbsolute(absolute));
  assert.equal(resolveOutDir(absolute, base), absolute, "join() would have appended the absolute path to the base");
});
