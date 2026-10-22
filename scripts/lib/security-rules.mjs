/**
 * Security hygiene rules. Secret rules apply to every text file. Content rules apply to
 * files shipped to users (plugins/**) because agents read and act on that text.
 *
 * Inline suppression: put `security-scan: allow RULE_ID <reason>` on the same line or the
 * line above. File-level suppression: config/security-allowlist.txt.
 */
import { extname } from "node:path";
import { isOsMetadata, TEXT_EXTENSIONS } from "./fsutil.mjs";

export const SECRET_RULES = [
  { id: "SECRET_AWS_ACCESS_KEY", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "SECRET_GITHUB_TOKEN", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/ },
  { id: "SECRET_SLACK_TOKEN", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: "SECRET_PRIVATE_KEY", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { id: "SECRET_AZURE_STORAGE_KEY", re: /AccountKey=[A-Za-z0-9+/]{60,}={0,2}/ },
  { id: "SECRET_GOOGLE_API_KEY", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "SECRET_ANTHROPIC_KEY", re: /\bsk-ant-[A-Za-z0-9_-]{32,}/ },
  { id: "SECRET_OPENAI_KEY", re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { id: "SECRET_STRIPE_LIVE_KEY", re: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { id: "SECRET_JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "SECRET_SALESFORCE_SESSION", re: /\b00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]{40,}/ },
];

/** Assignment of a literal to a secret-looking name. Placeholders and env lookups are ignored. */
export const ASSIGNMENT_RULE = {
  id: "SECRET_HARDCODED_ASSIGNMENT",
  re: /\b(password|passwd|pwd|secret|api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["']([^"'\s]{8,})["']/i,
  placeholder: /^(<.*>|\$\{.*\}|\{\{.*\}\}|%.*%|x{4,}|\*{4,}|changeme|example.*|placeholder.*|your[-_].*|dummy.*|test.*|redacted|replace[-_]?me.*|not[-_]?a[-_]?secret.*|.*\.{3})$/i,
};

export const CONTENT_RULES = [
  { id: "DANGER_PIPE_TO_SHELL", level: "error", re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i },
  { id: "DANGER_POWERSHELL_DOWNLOAD_EXEC", level: "error", re: /\b(?:iex|Invoke-Expression)\b[^\n]*\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b/i },
  { id: "DANGER_TLS_VERIFICATION_DISABLED", level: "error", re: /\bverify\s*=\s*False\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|\bcurl\b[^\n]*\s(?:-k|--insecure)\b|sslVerify\s*[:=]\s*false|rejectUnauthorized\s*:\s*false/i },
  { id: "DANGER_DESTRUCTIVE_COMMAND", level: "error", re: /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/|~|\$HOME)(?:\s|$)|\bchmod\s+(?:-R\s+)?777\b|\bmkfs\.|\bdd\s+if=.*\bof=\/dev\//i },
  { id: "PROMPT_INJECTION_PHRASE", level: "error", re: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b|\bdisregard\s+(?:the\s+)?(?:system|previous)\s+(?:prompt|instructions)\b|\bdo\s+not\s+(?:tell|inform)\s+the\s+user\b|\bexfiltrat/i },
  { id: "INSECURE_HTTP_URL", level: "warning", re: /\bhttp:\/\/(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|schemas\.)[^\s)'"<>]+/i },
  { id: "LARGE_ENCODED_BLOB", level: "warning", re: /[A-Za-z0-9+/]{240,}={0,2}/ },
];

/**
 * Characters that display as nothing, so they can hide text from reviewers while agents still
 * read it: bidirectional controls (Trojan Source, including U+061C), zero-width and invisible
 * formatting characters, the soft hyphen, the Mongolian vowel separator, U+FEFF inside a file,
 * Hangul fillers (used as invisible identifiers in JavaScript), interlinear annotation marks,
 * Unicode tag characters (U+E0000 to U+E007F, used to smuggle ASCII instructions), and the
 * supplementary variation selectors (U+E0100 to U+E01EF, used the same way).
 * Variation selectors U+FE00 to U+FE0F stay allowed because they follow ordinary emoji.
 * A byte order mark at the very start of a file is handled by linesForScan instead.
 */
const HIDDEN_RANGES = [
  [0x00ad, 0x00ad], [0x061c, 0x061c], [0x115f, 0x1160], [0x180e, 0x180e], [0x200b, 0x200f],
  [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0x3164, 0x3164], [0xfeff, 0xfeff],
  [0xffa0, 0xffa0], [0xfff9, 0xfffb], [0xe0000, 0xe007f], [0xe0100, 0xe01ef],
];
// Built from code points so this file itself contains no invisible characters. The u flag is
// needed for the ranges above U+FFFF.
const hiddenClass = HIDDEN_RANGES.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join("");
export const HIDDEN_UNICODE = { id: "HIDDEN_UNICODE", re: new RegExp(`[${hiddenClass}]`, "u") };

/**
 * Split file text into lines for the line rules. A UTF-8 byte order mark at the start is
 * removed first and returned as `bom`, so the scan can report it on its own instead of as a
 * hidden character on line 1.
 */
export function linesForScan(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  return { bom, lines: (bom ? text.slice(1) : text).split("\n") };
}

const NPM_REGISTRY = "https://registry.npmjs.org/";

/**
 * Lockfile entries that resolve from anywhere other than the public npm registry, as
 * [{ line, source }]. `source` is only the scheme and host, so a URL with credentials in it is
 * never copied into a report.
 */
export function lockfileRegistryProblems(text) {
  const problems = [];
  String(text ?? "").replace(/\r\n/g, "\n").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/"resolved"\s*:\s*"([^"]*)"/g)) {
      if (!m[1].startsWith(NPM_REGISTRY)) problems.push({ line: i + 1, source: describeSource(m[1]) });
    }
  });
  return problems;
}

function describeSource(url) {
  try {
    const u = new URL(url);
    return u.host ? `${u.protocol}//${u.host}` : u.protocol;
  } catch {
    return "a local path";
  }
}

/** Extension that decides how a file is scanned: `.gitignore` for dotfiles, `.license` for LICENSE. */
export function scanExtension(fileName) {
  const ext = extname(fileName).toLowerCase();
  if (ext) return ext;
  return fileName.startsWith(".") ? fileName.toLowerCase() : `.${fileName.toLowerCase()}`;
}

const NAMED_TEXT_FILES = new Set(["LICENSE", "CODEOWNERS"]);
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json"]);
const IMAGE_FILE = /\.(?:png|jpe?g|gif|ico)$/i;
const SKILL_SCRIPT = /^plugins\/[^/]+\/(?:skills\/[^/]+\/scripts|mcp)\//;

/**
 * How the scan treats one file, given its repository-relative POSIX path. Returns
 * { action, script, finding }:
 *   action   "scan" (run the line rules), "lockfile" (registry check only), or "skip"
 *   script   true for anything under a skill's scripts/ folder or a plugin's mcp/ folder
 *            (bundled MCP servers), whatever its type, so it is
 *            listed for the human review that SECURITY.md requires
 *   finding  { level, code, message } to report, or null
 *
 * Everything under plugins/ ships to users, so a file there that the scan cannot read is an
 * error, not a silent skip: a symbolic link (installers and archives treat links differently,
 * and the target can be outside the plugin), compiled Python (it can run without its source
 * being reviewed), or any other file type the scan does not know.
 */
export function classifyScanFile(file, { isLink = false } = {}) {
  const name = file.split("/").pop();
  const shipped = file.startsWith("plugins/");
  if (isOsMetadata(name)) return { action: "skip", script: false, finding: null };
  const script = SKILL_SCRIPT.test(file);
  if (isLink) {
    const finding = shipped
      ? { level: "error", code: "SYMLINK_NOT_ALLOWED", message: "Symbolic link under plugins/. Installers and archives copy links differently, and the target can be outside the plugin. Commit the file itself." }
      : { level: "warning", code: "SYMLINK_NOT_SCANNED", message: "Symbolic link. The scan does not follow links, so the target is not scanned." };
    return { action: "skip", script, finding };
  }
  if (LOCKFILES.has(name)) return { action: "lockfile", script, finding: null };
  if (TEXT_EXTENSIONS.has(scanExtension(name)) || NAMED_TEXT_FILES.has(name)) return { action: "scan", script, finding: null };
  if (shipped && !IMAGE_FILE.test(name)) {
    const message = "Plugins may ship only text files with a known extension, or PNG, JPEG, GIF, and ICO images. Remove compiled or binary files; for a new text format, add its extension to TEXT_EXTENSIONS in scripts/lib/fsutil.mjs.";
    return { action: "skip", script, finding: { level: "error", code: "UNREVIEWABLE_FILE", message } };
  }
  return { action: "skip", script, finding: null };
}
