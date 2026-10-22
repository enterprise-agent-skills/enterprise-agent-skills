import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "../../scripts/lib/zip.mjs";
import { createImage, decodePng, encodePng, fillRoundedRect } from "../../scripts/lib/png.mjs";
import {
  ACCENT_COLOR, AUTH_TYPES, CONNECTOR_ID, COWORK_APP_ID_NAMESPACE, MANIFEST_SCHEMA_URL, MANIFEST_VERSION, TOOLS_FILE,
  buildCoworkPackage, checkSkillPackageFiles, coworkAppId, normalizeTools, renderIcons, runPrintTools, uuidV5, validateCoworkManifest,
} from "../../scripts/cowork-package.mjs";
import { loadRepository } from "../../scripts/lib/repo-model.mjs";
import { REPO_ROOT } from "../../scripts/lib/constants.mjs";
import { readText } from "../../scripts/lib/fsutil.mjs";

const DEMO_URL = "https://contoso-sap.example.com/mcp/0123456789abcdef0123456789abcdef";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const noTools = () => ({ tools: null, reason: "not available in this test" });
const fakeTools = () => ({
  tools: { tools: [{ name: "sap_system_info", description: "Installed software components.", inputSchema: { type: "object", properties: {} } }] },
  reason: null,
});

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "fa-cowork-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pixel(image, x, y) {
  const o = (y * image.width + x) * 4;
  return [...image.data.subarray(o, o + 4)];
}

test("cowork: uuidV5 matches the RFC 4122 test vector and the app id is stable per plugin name", () => {
  assert.equal(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "python.org"), "886313e1-3b8a-5372-9b90-0c9aee199e5d");
  assert.match(COWORK_APP_ID_NAMESPACE, /^[0-9a-f-]{36}$/);
  assert.equal(coworkAppId("sap-abap"), coworkAppId("sap-abap"));
  assert.match(coworkAppId("sap-abap"), GUID, "a version 5 UUID with the RFC 4122 variant");
  assert.notEqual(coworkAppId("sap-abap"), coworkAppId("microsoft-fabric"));
  assert.throws(() => uuidV5("not-a-uuid", "x"), /Not a UUID/);
});

test("png: encode and decode round trip, anti-aliased rounded corners, deterministic bytes", () => {
  const image = createImage(16, 8);
  fillRoundedRect(image, { x: 0, y: 0, width: 16, height: 8, radius: 3, color: [10, 20, 30, 255] });
  assert.deepEqual(pixel(image, 8, 4), [10, 20, 30, 255], "the interior is fully covered");
  assert.equal(pixel(image, 0, 0)[3], 0, "the corner outside the radius stays transparent");
  const edge = pixel(image, 1, 0)[3];
  assert.ok(edge > 0 && edge < 255, `a corner edge pixel is partially covered (alpha ${edge})`);
  const png = encodePng(image);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const back = decodePng(png);
  assert.equal(back.width, 16);
  assert.equal(back.height, 8);
  assert.deepEqual(back.data, image.data);
  assert.deepEqual(encodePng(image), png, "the same image gives the same bytes");
  assert.throws(() => decodePng(Buffer.from("not a png")), /Not a PNG/);
});

test("cowork: the generated icons have the documented sizes and the outline is white on transparent", () => {
  const icons = renderIcons(ACCENT_COLOR);
  const color = decodePng(icons.color);
  assert.equal(color.width, 192);
  assert.equal(color.height, 192);
  const accent = [0x2e, 0x5c, 0x8a, 255];
  assert.deepEqual(pixel(color, 96, 80), accent, "between the bars the icon shows the accent color");
  assert.deepEqual(pixel(color, 96, 96), [255, 255, 255, 255], "the middle bar is white");
  assert.equal(pixel(color, 0, 0)[3], 0, "the rounded square leaves the corner transparent");
  const outline = decodePng(icons.outline);
  assert.equal(outline.width, 32);
  assert.equal(outline.height, 32);
  assert.equal(pixel(outline, 0, 0)[3], 0, "the background is transparent");
  assert.deepEqual(pixel(outline, 16, 10), [255, 255, 255, 255], "the bars are white");
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const [r, g, b, a] = pixel(outline, x, y);
      if (a > 0) assert.ok(r === 255 && g === 255 && b === 255, `outline pixel ${x},${y} must be white`);
    }
  }
  assert.throws(() => renderIcons("blue"), /#RRGGBB/);
});

test("cowork: companion file rules from the Cowork documentation", () => {
  const ok = [{ path: "SKILL.md", size: 10 }, { path: "references/a.md", size: 10 }, { path: "scripts/lookup_api_state.py", size: 10 }, { path: "LICENSE.txt", size: 10 }];
  assert.deepEqual(checkSkillPackageFiles("s", ok), []);
  assert.match(checkSkillPackageFiles("s", [{ path: "references/a.md", size: 1 }]).join("\n"), /SKILL\.md is missing/);
  const many = [{ path: "SKILL.md", size: 1 }, ...Array.from({ length: 21 }, (_, i) => ({ path: `references/${i}.md`, size: 1 }))];
  assert.match(checkSkillPackageFiles("s", many).join("\n"), /21 companion files; Cowork allows 20/);
  assert.match(checkSkillPackageFiles("s", [{ path: "SKILL.md", size: 1 }, { path: ".hidden", size: 1 }]).join("\n"), /hidden/);
  assert.match(checkSkillPackageFiles("s", [{ path: "SKILL.md", size: 1 }, { path: "references/con.md", size: 1 }]).join("\n"), /reserved name/);
  assert.match(checkSkillPackageFiles("s", [{ path: "SKILL.md", size: 1 }, { path: "references/a#b.md", size: 1 }]).join("\n"), /characters outside/);
  assert.match(checkSkillPackageFiles("s", [{ path: "SKILL.md", size: 1 }, { path: "../a.md", size: 1 }]).join("\n"), /parent folder/);
  assert.match(checkSkillPackageFiles("s", [{ path: "SKILL.md", size: 1 }, { path: "big.bin", size: 5 * 1024 * 1024 + 1 }]).join("\n"), /limit is 5242880 per file/);
  const total = [{ path: "SKILL.md", size: 1 }, { path: "a.bin", size: 5 * 1024 * 1024 }, { path: "b.bin", size: 5 * 1024 * 1024 }, { path: "c.bin", size: 1 }];
  assert.match(checkSkillPackageFiles("s", total).join("\n"), /total/);
});

test("cowork: manifest validation uses the vendored 1.29 schema plus the connector rules", () => {
  const good = {
    $schema: MANIFEST_SCHEMA_URL,
    manifestVersion: MANIFEST_VERSION,
    version: "1.0.0",
    id: coworkAppId("x"),
    developer: { name: "Enterprise Agent Skills", websiteUrl: "https://example.com", privacyUrl: "https://example.com#privacy", termsOfUseUrl: "https://example.com#terms" },
    name: { short: "x" },
    description: { short: "s", full: "f" },
    icons: { color: "color.png", outline: "outline.png" },
    accentColor: "#123456",
    agentSkills: [{ folder: "./skills/a" }],
    agentConnectors: [{ id: "c", displayName: "C", toolSource: { remoteMcpServer: { mcpServerUrl: "https://h/mcp", authorization: { type: "OAuthPluginVault", referenceId: "r" } } } }],
  };
  assert.deepEqual(validateCoworkManifest(good), []);
  const noRef = structuredClone(good);
  delete noRef.agentConnectors[0].toolSource.remoteMcpServer.authorization.referenceId;
  assert.match(validateCoworkManifest(noRef).join("\n"), /required property 'referenceId'/);
  const noneWithRef = structuredClone(good);
  noneWithRef.agentConnectors[0].toolSource.remoteMcpServer.authorization = { type: "None", referenceId: "r" };
  assert.match(validateCoworkManifest(noneWithRef).join("\n"), /referenceId must not be present/);
  const extra = structuredClone(good);
  extra.packageName = "com.example";
  assert.match(validateCoworkManifest(extra).join("\n"), /additional properties 'packageName'/);
  const http = structuredClone(good);
  http.agentConnectors[0].toolSource.remoteMcpServer.mcpServerUrl = "http://h/mcp";
  assert.match(validateCoworkManifest(http).join("\n"), /mcpServerUrl must match pattern/);
  const longName = structuredClone(good);
  longName.developer.name = "x".repeat(33);
  assert.match(validateCoworkManifest(longName).join("\n"), /developer\/name must NOT have more than 32/);
  const dup = structuredClone(good);
  dup.agentConnectors.push(structuredClone(dup.agentConnectors[0]));
  assert.match(validateCoworkManifest(dup).join("\n"), /duplicate connector id/);
});

test("cowork: demo package layout, manifest fields and limits, icons, and reproducible bytes", () => {
  withTemp((dir) => {
    const first = buildCoworkPackage({ plugin: "sap-abap", mcpUrl: DEMO_URL, auth: "None", outDir: join(dir, "one"), printTools: noTools });
    assert.equal(first.zipPath, join(dir, "one", "sap-abap-cowork-plugin.zip"));
    assert.ok(existsSync(first.zipPath));
    assert.equal(first.tools.included, false);
    const entries = readZip(readFileSync(first.zipPath));
    const files = entries.filter((e) => !e.path.endsWith("/")).map((e) => e.path);
    const roots = new Set(files.map((f) => f.split("/")[0]));
    assert.deepEqual([...roots].sort(), ["color.png", "manifest.json", "outline.png", "skills"], "only the documented files and folders at the root");
    assert.ok(files.every((f) => !f.split("/").some((s) => s.startsWith("."))), "no hidden files");
    assert.ok(!files.some((f) => f.startsWith("tools/")), "no tools folder when the server cannot run");

    const model = loadRepository();
    const plugin = model.plugins.find((p) => p.source?.name === "sap-abap");
    const license = readFileSync(join(REPO_ROOT, "LICENSE"));
    for (const s of plugin.skills) {
      for (const rel of s.files) {
        const entry = entries.find((e) => e.path === `skills/${s.dirName}/${rel}`);
        assert.ok(entry, `skills/${s.dirName}/${rel} is in the package`);
        assert.deepEqual(entry.data, readFileSync(join(s.dir, rel)), `${rel} is unchanged`);
      }
      assert.deepEqual(entries.find((e) => e.path === `skills/${s.dirName}/LICENSE.txt`)?.data, license, `${s.dirName} has LICENSE.txt`);
      const companions = files.filter((f) => f.startsWith(`skills/${s.dirName}/`) && f !== `skills/${s.dirName}/SKILL.md`);
      assert.ok(companions.length <= 20, `${s.dirName} has at most 20 companion files`);
    }

    const manifest = JSON.parse(entries.find((e) => e.path === "manifest.json").data.toString("utf8"));
    assert.deepEqual(manifest, first.manifest);
    assert.equal(manifest.$schema, MANIFEST_SCHEMA_URL);
    assert.equal(manifest.manifestVersion, "1.29");
    assert.equal(manifest.version, plugin.source.version);
    assert.equal(manifest.id, coworkAppId("sap-abap"));
    assert.equal(manifest.developer.name, "Enterprise Agent Skills");
    assert.ok(manifest.developer.name.length <= 32);
    assert.equal(manifest.developer.websiteUrl, "https://github.com/enterprise-agent-skills/enterprise-agent-skills");
    assert.equal(manifest.developer.privacyUrl, "https://github.com/enterprise-agent-skills/enterprise-agent-skills/blob/main/docs/copilot-cowork.md#privacy");
    assert.equal(manifest.developer.termsOfUseUrl, "https://github.com/enterprise-agent-skills/enterprise-agent-skills/blob/main/docs/copilot-cowork.md#terms-of-use");
    const guide = readText(join(REPO_ROOT, "docs", "copilot-cowork.md"));
    assert.match(guide, /^## Privacy$/m, "the guide has the heading the privacy URL anchors to");
    assert.match(guide, /^## Terms of use$/m, "the guide has the heading the terms URL anchors to");
    assert.equal(manifest.name.short, "sap-abap");
    assert.ok(manifest.name.short.length <= 30);
    assert.ok(manifest.name.full.length <= 100);
    assert.ok(manifest.description.short.length <= 80);
    assert.ok(manifest.description.full.length <= 4000);
    assert.match(manifest.description.full, /not affiliated with SAP or Microsoft/);
    assert.match(manifest.accentColor, /^#[0-9A-Fa-f]{6}$/);
    assert.deepEqual(manifest.icons, { color: "color.png", outline: "outline.png" });
    assert.deepEqual(manifest.agentSkills, plugin.source.skill_order.map((name) => ({ folder: `./skills/${name}` })), "skills in the plugin's display order");
    assert.ok(manifest.agentSkills.length <= 20);
    for (const s of manifest.agentSkills) assert.ok(files.includes(`${s.folder.replace(/^\.\//, "")}/SKILL.md`), `${s.folder} exists in the ZIP with SKILL.md`);
    assert.equal(manifest.agentConnectors.length, 1);
    const connector = manifest.agentConnectors[0];
    assert.equal(connector.id, CONNECTOR_ID);
    assert.ok(connector.displayName.length <= 128);
    assert.deepEqual(connector.toolSource.remoteMcpServer, { mcpServerUrl: DEMO_URL, authorization: { type: "None" } }, "demo mode: no referenceId and no tool description file");
    assert.deepEqual(validateCoworkManifest(manifest), []);

    const color = decodePng(entries.find((e) => e.path === "color.png").data);
    assert.deepEqual([color.width, color.height], [192, 192]);
    const outline = decodePng(entries.find((e) => e.path === "outline.png").data);
    assert.deepEqual([outline.width, outline.height], [32, 32]);

    const second = buildCoworkPackage({ plugin: "sap-abap", mcpUrl: DEMO_URL, auth: "None", outDir: join(dir, "two"), printTools: noTools });
    assert.equal(second.sha256, first.sha256, "two builds of the same inputs are identical");
    assert.deepEqual(readFileSync(second.zipPath), readFileSync(first.zipPath));
  });
});

test("cowork: production package carries the auth config id and the tool list when the server can run", () => {
  withTemp((dir) => {
    let calls = 0;
    const result = buildCoworkPackage({
      mcpUrl: "https://contoso-sap.example.com/mcp",
      auth: "OAuthPluginVault",
      authConfigId: "A1bC2dE3fH4iJ5kL6mN7oP8qR9sT0u",
      outDir: dir,
      version: "v1.2.3",
      appId: "11111111-2222-4333-8444-555555555555",
      shortName: "SAP ABAP",
      includeTools: true,
      printTools: (launcher) => {
        calls++;
        assert.match(launcher.replace(/\\/g, "/"), /plugins\/sap-abap\/mcp\/sap-system\/launch\.mjs$/);
        return fakeTools();
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.tools.included, true);
    assert.deepEqual(result.tools.names, ["sap_system_info"]);
    const entries = readZip(readFileSync(result.zipPath));
    const manifest = JSON.parse(entries.find((e) => e.path === "manifest.json").data.toString("utf8"));
    assert.equal(manifest.version, "1.2.3", "a leading v is removed");
    assert.equal(manifest.id, "11111111-2222-4333-8444-555555555555");
    assert.equal(manifest.name.short, "SAP ABAP");
    assert.deepEqual(manifest.agentConnectors[0].toolSource.remoteMcpServer, {
      mcpServerUrl: "https://contoso-sap.example.com/mcp",
      mcpToolDescription: { file: TOOLS_FILE },
      authorization: { type: "OAuthPluginVault", referenceId: "A1bC2dE3fH4iJ5kL6mN7oP8qR9sT0u" },
    });
    const tools = JSON.parse(entries.find((e) => e.path === TOOLS_FILE).data.toString("utf8"));
    assert.deepEqual(tools, fakeTools().tools, "the tool list is stored in the tools/list format");
    assert.deepEqual(validateCoworkManifest(manifest), []);

    const skipped = buildCoworkPackage({ mcpUrl: "https://contoso-sap.example.com/mcp", auth: "OAuthPluginVault", authConfigId: "abc", outDir: join(dir, "skip"), includeTools: false, printTools: () => assert.fail("printTools must not run with includeTools: false") });
    assert.equal(skipped.tools.included, false);
    assert.ok(!skipped.entries.includes(TOOLS_FILE));
  });
});

test("cowork: tool list normalization and the launcher runner", () => {
  const tool = { name: "t", description: "d", inputSchema: { type: "object" } };
  assert.deepEqual(normalizeTools([tool]).tools, { tools: [tool] });
  assert.deepEqual(normalizeTools({ tools: [tool], nextCursor: null }).tools, { tools: [tool] });
  assert.equal(normalizeTools({ tools: [] }).tools, null);
  assert.match(normalizeTools({ tools: [{ name: "t" }] }).reason, /lacks name, description, or inputSchema/);
  assert.match(normalizeTools("x").reason, /no tools/);
  const missing = runPrintTools(join(REPO_ROOT, "plugins", "no-such-plugin", "mcp", "sap-system", "launch.mjs"));
  assert.equal(missing.tools, null);
  assert.match(missing.reason, /not found/);
});

test("cowork: argument validation", () => {
  withTemp((dir) => {
    const base = { outDir: dir, printTools: noTools };
    assert.deepEqual(AUTH_TYPES, ["OAuthPluginVault", "None"]);
    assert.throws(() => buildCoworkPackage({ ...base, auth: "None" }), /Missing --mcp-url/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: "http://contoso-sap.example.com/mcp", auth: "None" }), /must start with https/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: "https://user:pw@contoso-sap.example.com/mcp", auth: "None" }), /must not contain credentials/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: "not a url", auth: "None" }), /not a valid URL/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL }), /Missing --auth/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "DynamicClientRegistration" }), /--auth must be one of OAuthPluginVault, None/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "OAuthPluginVault" }), /Missing --auth-config-id/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "OAuthPluginVault", authConfigId: "x".repeat(129) }), /longer than 128/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "None", authConfigId: "abc" }), /must be left out with --auth None/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "None", version: "1.2" }), /MAJOR\.MINOR\.PATCH/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "None", appId: "not-a-guid" }), /--app-id must be a GUID/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "None", plugin: "no-such-plugin" }), /not found/);
    assert.throws(() => buildCoworkPackage({ ...base, mcpUrl: DEMO_URL, auth: "None", shortName: "x".repeat(31) }), /name\/short must NOT have more than 30/);
  });
});

test("cowork: the command line builds a package and reports bad arguments with exit code 1", () => {
  withTemp((dir) => {
    const script = join(REPO_ROOT, "scripts", "cowork-package.mjs");
    const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: REPO_ROOT, windowsHide: true });
    const ok = run(["--mcp-url", DEMO_URL, "--auth", "None", "--out", dir]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /cowork-package: wrote .*sap-abap-cowork-plugin\.zip/);
    assert.match(ok.stdout, /<secret path not shown>/, "the demo secret is not echoed");
    assert.match(ok.stdout, /not included \(left out \(pass --tools to include it\)\)/);
    assert.ok(!ok.stdout.includes("0123456789abcdef0123456789abcdef"));
    assert.ok(existsSync(join(dir, "sap-abap-cowork-plugin.zip")));
    const bad = run(["--mcp-url", DEMO_URL, "--auth", "OAuthPluginVault", "--out", dir]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Missing --auth-config-id/);
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--auth-config-id/);
  });
});
