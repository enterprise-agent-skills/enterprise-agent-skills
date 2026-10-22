import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { REPO_ROOT } from "../../scripts/lib/constants.mjs";
import { findPython } from "../harness/validators.mjs";

// The bundled MCP server runs on users' machines, so its guards get real tests. The offline
// self-check needs only the Python standard library; the MCP and httpx packages are not
// installed in CI, so the parts that need them are skipped there.
const python = findPython();
const inCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const skip = !python && !inCI ? "no Python 3 on PATH" : false;

const dir = join(REPO_ROOT, "plugins/sap-abap/mcp/sap-system");
const server = join(dir, "sap_system_mcp.py");
const launcher = join(dir, "launch.mjs");

function hasModules() {
  // The repository root holds a folder named mcp/, which Python would otherwise import as a
  // namespace package from the current directory.
  const r = spawnSync(python, ["-c", "import sys, os; sys.path = [p for p in sys.path if p not in ('', os.getcwd())]; import mcp, httpx"], { encoding: "utf8" });
  return r.status === 0;
}

test("sap-system: the offline self-check of the guards and token rules passes", { skip }, () => {
  const r = spawnSync(python, ["-I", server, "self-check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /self-check: \d+ checks passed/);
});

test("sap-system: config-path points outside the plugin folder", { skip }, () => {
  const r = spawnSync(python, ["-I", server, "config-path"], { encoding: "utf8", env: { ...process.env, SAP_SYSTEM_MCP_ENV: "" } });
  assert.equal(r.status, 0, r.stderr);
  const path = r.stdout.trim();
  assert.ok(path.endsWith("sap-system.env"), path);
  assert.ok(!path.startsWith(dir), "the config file must not live inside the plugin");
});

test("sap-system: the launcher reports the interpreter it would use", { skip }, () => {
  const r = spawnSync(process.execPath, [launcher, "--which"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Python 3\.\d+/);
});

test("sap-system: print-tools lists the documented tools with wire-format schemas", { skip: skip || (python && !hasModules() ? "mcp and httpx are not installed" : false) }, () => {
  const r = spawnSync(python, [server, "print-tools"], { encoding: "utf8", env: { ...process.env, SAP_SYSTEM_MCP_ENV: join(dir, "does-not-exist.env") } });
  assert.equal(r.status, 0, r.stderr);
  const names = JSON.parse(r.stdout).tools.map((t) => t.name);
  for (const expected of ["sap_connection_info", "sap_system_info", "sap_search_objects", "sap_describe_table", "sap_read_table", "sap_read_source", "sap_list_package", "sap_odata_list_services", "sap_odata_metadata", "sap_odata_query"]) {
    assert.ok(names.includes(expected), `${expected} is missing`);
  }
  assert.ok(!names.includes("sap_run_select"), "free SQL is not offered in focused mode");
  assert.ok(JSON.parse(r.stdout).tools.every((t) => t.inputSchema), "schemas use the wire name inputSchema");
});

test("sap-system: an unconfigured server answers tools with the setup instructions instead of failing", { skip: skip || (python && !hasModules() ? "mcp and httpx are not installed" : false) }, () => {
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "sap_connection_info", arguments: {} } },
  ];
  const r = spawnSync(python, [server, "serve"], {
    encoding: "utf8",
    input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    env: { ...process.env, SAP_SYSTEM_MCP_ENV: join(dir, "does-not-exist.env"), SAP_URL: "", SAP_USER: "", SAP_PASSWORD: "" },
    timeout: 60000,
  });
  const replies = r.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const call = replies.find((m) => m.id === 2);
  assert.ok(call, `no reply to the tool call; stderr: ${r.stderr}`);
  const text = JSON.stringify(call.result);
  assert.match(text, /not configured/);
  assert.match(text, /launch\.mjs setup/);
});
