import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { REPO_ROOT } from "./constants.mjs";

/** Convert any path to forward slashes for stable output across Windows and Linux. */
export function toPosix(p) {
  return p.split(sep).join("/");
}

/** Repository-relative POSIX path. */
export function rel(absPath) {
  return toPosix(relative(REPO_ROOT, absPath));
}

export function abs(relPath) {
  return join(REPO_ROOT, relPath);
}

/** Read UTF-8 text and normalize line endings to LF so checks behave the same on every OS. */
export function readText(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

export function exists(path) {
  return existsSync(path);
}

export function isDir(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

/** Immediate child directory names, sorted. */
export function listDirs(path) {
  if (!isDir(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

const DEFAULT_SKIP = new Set([".git", "node_modules", "reports", ".vally-work"]);

/** Recursively list files under `root` (absolute paths), skipping heavy or generated folders. */
export function walkFiles(root, { skip = DEFAULT_SKIP } = {}) {
  const out = [];
  if (!isDir(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort();
}

/**
 * Write a file only when its content changed. In check mode nothing is written and the
 * caller receives `changed: true` for any file that is missing or out of date.
 */
export function writeIfChanged(path, content, { check = false } = {}) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  const current = existsSync(path) ? readText(path) : null;
  if (current === normalized) return { changed: false };
  if (!check) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, normalized, "utf8");
  }
  return { changed: true, missing: current === null };
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Text file extensions the scanners read. Binary files are skipped. */
export const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".mjs", ".js", ".cjs", ".ts", ".py",
  ".abap", ".asddls", ".asbdef", ".asddlxs", ".cls", ".trigger", ".sql", ".kql", ".ps1",
  ".sh", ".toml", ".xml", ".html", ".css", ".csv", ".tmpl", ".gitignore", ".gitattributes", ".editorconfig",
]);
