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

/**
 * Recursively list files under `root` (absolute paths), skipping heavy or generated folders.
 *
 * Symbolic links are left out by default, so callers that read files never follow a link out
 * of the folder. With `links: true` they are listed too (file and folder links alike, never
 * followed), for the security scan, which reports them instead of reading them.
 */
export function walkFiles(root, { skip = DEFAULT_SKIP, links = false } = {}) {
  const out = [];
  if (!isDir(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() || (links && entry.isSymbolicLink())) out.push(full);
    }
  }
  return out.sort();
}

/** Files that Finder and Windows Explorer create in folders. They hold no content. */
const OS_METADATA_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** True for OS folder metadata such as .DS_Store. Accepts a file name or a path. */
export function isOsMetadata(path) {
  return OS_METADATA_FILES.has(path.split(/[\\/]/).pop());
}

/**
 * True for local files that never belong in a skill or plugin package: OS folder metadata and
 * Python bytecode caches. Both are git-ignored. Accepts a relative path with either separator.
 */
export function isLocalJunk(path) {
  const parts = path.split(/[\\/]/);
  return isOsMetadata(path) || parts[parts.length - 1].endsWith(".pyc") || parts.includes("__pycache__");
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

/**
 * Text file extensions the security scan reads. Dotfiles are listed by their full name. Under
 * plugins/, a file with any other extension fails the scan unless it is a PNG, JPEG, GIF, or
 * ICO image (see classifyScanFile in security-rules.mjs), so add an extension here before a
 * skill ships that file type. SVG is text and can carry script, so it is scanned.
 */
export const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".mjs", ".js", ".cjs", ".ts", ".py",
  ".abap", ".asddls", ".asbdef", ".asddlxs", ".srvdsrv", ".cls", ".trigger", ".sql", ".kql", ".ps1",
  ".psm1", ".psd1", ".sh", ".bat", ".cmd", ".vbs", ".rb", ".pl", ".java", ".cs", ".go",
  ".toml", ".xml", ".html", ".css", ".svg", ".csv", ".tmpl",
  ".gitignore", ".gitattributes", ".editorconfig", ".npmrc",
]);
