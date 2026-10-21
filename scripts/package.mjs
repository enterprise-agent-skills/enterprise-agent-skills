#!/usr/bin/env node
/**
 * Build downloadable ZIP files for every published skill and plugin.
 *
 *   npm run package                         writes dist/
 *   npm run package -- --out <dir> --version v0.1.0
 *
 * dist/skills/<skill>.zip     one folder named after the skill, with SKILL.md inside: the
 *                             structure Claude's skill upload and every skills folder expect
 * dist/plugins/plugin-<plugin>.zip  one folder named after the plugin, with every manifest
 * dist/all-skills.zip         every skill folder at the top level, to unzip into a skills folder
 * dist/copilot-cowork/<skill>-copilot-cowork.zip and plugin-<plugin>-copilot-cowork.zip
 *                             the same files without the top-level folder: Microsoft 365
 *                             Copilot Cowork's skill upload wants SKILL.md at the archive root,
 *                             which Claude's skill upload does not recognize
 * dist/SHA256SUMS.txt         checksums of all ZIP files
 * dist/RELEASE_NOTES.md       asset list and install pointers for the GitHub release
 *
 * Every archive folder also gets LICENSE.txt, a copy of the repository LICENSE, because the MIT
 * License asks for its notice in every copy and installs copy only the skill or plugin folder.
 *
 * The output folder is deleted and rebuilt on every run, so the script refuses any folder it
 * did not create: a relative --out is resolved against the folder npm was started from, and a
 * folder that is not empty must hold the marker file an earlier run wrote (see checkOutDir).
 *
 * The release workflow (.github/workflows/release.yml) runs this after the checks pass and
 * attaches the files to the GitHub release for the tag.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/constants.mjs";
import { isLocalJunk, walkFiles } from "./lib/fsutil.mjs";
import { loadRepository, repoUrls, taxonomy } from "./lib/repo-model.mjs";
import { parseArgs } from "./lib/report.mjs";
import { createZip } from "./lib/zip.mjs";

/** Written into every output folder so a later run knows it may delete that folder. */
export const OUTPUT_MARKER = ".package-output";

/**
 * Files under `dir`, as { path, data } with `prefix/` plus the path relative to `dir`. An empty
 * prefix puts the files at the archive root.
 */
function folderEntries(dir, prefix) {
  return walkFiles(dir)
    .map((f) => relative(dir, f).split(sep).join("/"))
    .filter((p) => !isLocalJunk(p))
    .map((p) => ({ path: prefix ? `${prefix}/${p}` : p, data: readFileSync(join(dir, p)) }));
}

/**
 * Resolve --out the way a user means it. npm runs scripts from the repository root, so a
 * relative path is resolved against INIT_CWD, the folder npm was started from; an absolute path
 * stays as given (join would have appended it to the working directory).
 */
export function resolveOutDir(out, base = process.env.INIT_CWD ?? process.cwd()) {
  return resolve(base, out);
}

/**
 * Return the resolved output folder, or throw if deleting it could destroy anything the script
 * did not create. Allowed: the default dist/ folder of the repository, a folder that does not
 * exist or is empty, and a folder that holds OUTPUT_MARKER from an earlier run. Refused always:
 * the repository, any folder that contains it, a drive or file system root, and a file.
 * This function only reads; it never deletes.
 */
export function checkOutDir(outDir) {
  const out = resolve(outDir);
  const root = resolve(REPO_ROOT);
  const key = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  if (key(out) === key(join(root, "dist"))) return out;
  const prefix = out.endsWith(sep) ? out : `${out}${sep}`;
  if (key(out) === key(root) || key(root).startsWith(key(prefix)) || dirname(out) === out) {
    throw new Error(`Refusing to delete ${out}: it is the repository, a folder that contains it, or a drive root. Choose a new or empty folder.`);
  }
  if (!existsSync(out)) return out;
  if (!statSync(out).isDirectory()) throw new Error(`Refusing to use ${out}: it is a file, not a folder.`);
  if (readdirSync(out).length > 0 && !existsSync(join(out, OUTPUT_MARKER))) {
    throw new Error(`Refusing to delete ${out}: it is not empty and was not created by npm run package. Choose a new or empty folder.`);
  }
  return out;
}

export function buildPackages({ outDir = join(REPO_ROOT, "dist"), version = null } = {}) {
  outDir = checkOutDir(outDir);
  const model = loadRepository();
  if (model.loadErrors.length) throw new Error(`Repository has load errors: ${model.loadErrors.map((e) => e.file).join(", ")}`);
  const urls = repoUrls(model.config);
  const vendorNames = taxonomy(model.config).vendorNames;
  // Same display order as the README: vendor order from repo.config.yaml (SAP first), then the
  // plugin's skill_order.
  const vendorRank = Object.fromEntries((model.config?.vendors ?? []).map((v, i) => [v.id, i]));
  const rank = (p) => vendorRank[p.source.vendor] ?? Number.MAX_SAFE_INTEGER;
  const plugins = model.plugins.filter((p) => p.source).sort((a, b) => rank(a) - rank(b) || a.source.name.localeCompare(b.source.name));
  const skillRank = (p, name) => {
    const order = p.source.skill_order ?? [];
    return order.includes(name) ? order.indexOf(name) : order.length;
  };
  const skills = plugins.flatMap((p) => p.skills
    .filter((s) => s.data)
    .sort((a, b) => skillRank(p, a.data.name) - skillRank(p, b.data.name) || a.data.name.localeCompare(b.data.name))
    .map((s) => ({ ...s, pluginName: p.source.name, vendor: p.source.vendor })));

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "skills"), { recursive: true });
  mkdirSync(join(outDir, "plugins"), { recursive: true });
  mkdirSync(join(outDir, "copilot-cowork"), { recursive: true });
  // Written before any archive, so a run that fails halfway still leaves a folder the next run
  // may clean. The release workflow uploads only the files it names, never this marker.
  writeFileSync(join(outDir, OUTPUT_MARKER), "Created by npm run package. This folder is deleted and rebuilt on every run.\n");

  const written = [];
  const write = (relPath, buffer) => {
    // Release assets share one flat namespace, so file names must be unique across folders.
    const name = relPath.split("/").pop();
    if (written.some((w) => w.relPath.split("/").pop() === name)) throw new Error(`Duplicate package name ${name}.`);
    writeFileSync(join(outDir, relPath), buffer);
    written.push({ relPath, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") });
  };

  const license = readFileSync(join(REPO_ROOT, "LICENSE"));
  const withLicense = (dir, folder) => {
    const entries = folderEntries(dir, folder);
    const target = folder ? `${folder}/LICENSE.txt` : "LICENSE.txt";
    if (entries.some((e) => e.path.toLowerCase() === target.toLowerCase())) {
      throw new Error(`${target} already exists in the source folder; packaging would replace it. Decide which license applies first.`);
    }
    return [...entries, { path: target, data: license }];
  };
  for (const s of skills) write(`skills/${s.data.name}.zip`, createZip(withLicense(s.dir, s.data.name)));
  for (const p of plugins) write(`plugins/plugin-${p.source.name}.zip`, createZip(withLicense(p.dir, p.source.name)));
  write("all-skills.zip", createZip(skills.flatMap((s) => withLicense(s.dir, s.data.name))));
  // Microsoft 365 Copilot Cowork: SKILL.md, or .claude-plugin/plugin.json, at the archive root.
  for (const s of skills) write(`copilot-cowork/${s.data.name}-copilot-cowork.zip`, createZip(withLicense(s.dir, "")));
  for (const p of plugins) write(`copilot-cowork/plugin-${p.source.name}-copilot-cowork.zip`, createZip(withLicense(p.dir, "")));

  const sums = written.map((w) => `${w.sha256}  ${w.relPath.split("/").pop()}`).join("\n") + "\n";
  writeFileSync(join(outDir, "SHA256SUMS.txt"), sums);

  const vendors = [...new Set(plugins.map((p) => vendorNames[p.source.vendor] ?? p.source.vendor))];
  const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const notes = [
    `Downloadable packages${version ? ` for ${version}` : ""}. Each skill ZIP holds one folder named after the skill, with SKILL.md inside. Files ending in -copilot-cowork.zip hold the same skill or plugin with its files at the root of the ZIP, the layout Microsoft 365 Copilot Cowork's upload expects.`,
    "",
    `Independent community project. Not affiliated with, sponsored by, or endorsed by ${[...vendors, "any other vendor named here"].join(", ").replace(/, ([^,]+)$/, ", or $1")}. Product names are trademarks of their owners. MIT License; each archive includes LICENSE.txt.`,
    "",
    `How to use them in Claude, Claude Code, Microsoft 365 Copilot Cowork, GitHub Copilot, OpenAI Codex, Cursor, and Gemini CLI: ${urls.repo}#download-skills-as-zip-files`,
    "",
    "| File | Contents | Size |",
    "| --- | --- | --- |",
    ...written.map((w) => {
      const name = w.relPath.split("/").pop();
      let what = "Every skill, one folder each";
      if (w.relPath.startsWith("skills/")) {
        const s = skills.find((k) => `${k.data.name}.zip` === name);
        what = `Skill \`${s.data.name}\` (plugin \`${s.pluginName}\`)`;
      } else if (w.relPath.startsWith("plugins/")) {
        what = `Plugin \`${name.replace(/^plugin-/, "").replace(/\.zip$/, "")}\` with all platform manifests`;
      } else if (w.relPath.startsWith("copilot-cowork/plugin-")) {
        what = `Plugin \`${name.replace(/^plugin-/, "").replace(/-copilot-cowork\.zip$/, "")}\` for Microsoft 365 Copilot Cowork (Upload plugin)`;
      } else if (w.relPath.startsWith("copilot-cowork/")) {
        what = `Skill \`${name.replace(/-copilot-cowork\.zip$/, "")}\` for Microsoft 365 Copilot Cowork (Upload skill)`;
      }
      return `| \`${name}\` | ${what} | ${kb(w.size)} |`;
    }),
    "",
    "Verify a download with `sha256sum -c --ignore-missing SHA256SUMS.txt` (Linux), `shasum -a 256 -c --ignore-missing SHA256SUMS.txt` (macOS), or `Get-FileHash <file> -Algorithm SHA256` (Windows PowerShell).",
    "",
    `\`provenance.sigstore.json\` is the signed build provenance of the ZIP files. To check that a ZIP was built by a GitHub Actions workflow in this repository, run \`gh attestation verify <file> --repo ${urls.slug}\` with the GitHub CLI.`,
    "",
  ].join("\n");
  writeFileSync(join(outDir, "RELEASE_NOTES.md"), notes);
  return { outDir, written };
}

const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === "string" ? resolveOutDir(args.out) : undefined;
  try {
    const { outDir: dir, written } = buildPackages({ outDir, version: typeof args.version === "string" ? args.version : null });
    for (const w of written) console.log(`${w.relPath.padEnd(48)} ${String(w.size).padStart(8)} bytes`);
    console.log(`package: ${written.length} ZIP files in ${relative(process.cwd(), dir) || "."}`);
  } catch (err) {
    console.error(`package: ${err.message}`);
    process.exit(1);
  }
}
