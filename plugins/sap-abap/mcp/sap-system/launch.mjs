#!/usr/bin/env node
/**
 * Start the sap-system MCP server with whichever Python 3 this machine has.
 *
 * Agents that load plugins (Claude Code, GitHub Copilot CLI, Gemini CLI, Cursor) all run on
 * Node.js, but the name of the Python interpreter differs by platform: python3 on macOS and
 * Linux, python or the py launcher on Windows. This launcher finds one, checks that the
 * server's dependencies import, and then runs sap_system_mcp.py with the same arguments and
 * the same stdin and stdout, which carry the MCP protocol.
 *
 *   node launch.mjs serve           start the server (MCP over stdio)
 *   node launch.mjs setup           one-time setup: test the connection, write the config file
 *   node launch.mjs selftest        check the connection and exit
 *   node launch.mjs print-tools     print the tools as JSON
 *   node launch.mjs --which         print the interpreter that would be used
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "sap_system_mcp.py");
const MIN_VERSION = [3, 10];
const CANDIDATES = process.platform === "win32"
  ? [["python", []], ["py", ["-3"]], ["python3", []]]
  : [["python3", []], ["python", []]];

function probe(command, prefix) {
  const r = spawnSync(command, [...prefix, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0 || !r.stdout) return null;
  const [major, minor] = r.stdout.trim().split(".").map(Number);
  if (major < MIN_VERSION[0] || (major === MIN_VERSION[0] && minor < MIN_VERSION[1])) return null;
  return { command, prefix, version: `${major}.${minor}` };
}

function findPython() {
  for (const [command, prefix] of CANDIDATES) {
    const found = probe(command, prefix);
    if (found) return found;
  }
  return null;
}

// The current folder is dropped from the module search path: a folder named mcp/ (this
// repository has one at its root) would otherwise pass as the mcp package.
const PROBE = "import sys, os; sys.path = [p for p in sys.path if p not in ('', os.getcwd())]; import importlib.util as u; print(' '.join(m for m in ['mcp', 'httpx'] if u.find_spec(m) is None))";

function missingModules(python) {
  const r = spawnSync(python.command, [...python.prefix, "-c", PROBE], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.trim().split(/\s+/).filter(Boolean) : ["mcp", "httpx"];
}

const args = process.argv.slice(2);
const python = findPython();
if (!python) {
  console.error(`sap-system: no Python ${MIN_VERSION.join(".")} or later was found on PATH. Install Python from https://www.python.org/downloads/ and run the setup again.`);
  process.exit(1);
}
if (args[0] === "--which") {
  console.log(`${[python.command, ...python.prefix].join(" ")} (Python ${python.version})`);
  process.exit(0);
}
const missing = missingModules(python);
if (missing.length) {
  console.error(`sap-system: the Python packages ${missing.join(" and ")} are missing. Install them with:\n  ${[python.command, ...python.prefix].join(" ")} -m pip install "mcp>=2,<3" "httpx>=0.28,<1"\nThen run the setup again.`);
  process.exit(1);
}
const child = spawnSync(python.command, [...python.prefix, SERVER, ...args], { stdio: "inherit", windowsHide: true });
process.exit(child.status ?? 1);
