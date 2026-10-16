/**
 * Security hygiene rules. Secret rules apply to every text file. Content rules apply to
 * files shipped to users (plugins/**) because agents read and act on that text.
 *
 * Inline suppression: put `security-scan: allow RULE_ID <reason>` on the same line or the
 * line above. File-level suppression: config/security-allowlist.txt.
 */

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

/** Zero-width, bidirectional override, and invisible formatting characters (Trojan Source). */
const HIDDEN_RANGES = [[0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069]];
// Built from code points so this file itself contains no invisible characters.
const hiddenClass = HIDDEN_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("");
export const HIDDEN_UNICODE = { id: "HIDDEN_UNICODE", re: new RegExp(`[${hiddenClass}]`) };
