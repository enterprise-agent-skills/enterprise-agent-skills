import { parse as parseYaml } from "yaml";

/**
 * Split a Markdown document into YAML frontmatter and body.
 * Returns { data, body, bodyStartLine, error }. `error` is set when the frontmatter
 * block is missing, unterminated, or not valid YAML.
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { data: null, body: normalized, bodyStartLine: 1, error: "File must start with a YAML frontmatter block ('---')." };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    return { data: null, body: normalized, bodyStartLine: 1, error: "Frontmatter block is not terminated with '---'." };
  }
  const yamlText = normalized.slice(4, end);
  const afterFence = normalized.indexOf("\n", end + 1);
  const body = afterFence === -1 ? "" : normalized.slice(afterFence + 1);
  const bodyStartLine = yamlText.split("\n").length + 3;
  try {
    const data = parseYaml(yamlText, { prettyErrors: true });
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { data: null, body, bodyStartLine, error: "Frontmatter must be a YAML mapping." };
    }
    return { data, body, bodyStartLine, error: null };
  } catch (err) {
    return { data: null, body, bodyStartLine, error: `Invalid YAML frontmatter: ${err.message.split("\n")[0]}` };
  }
}

/** Serialize simple frontmatter back to YAML, keeping key order. Used by the upstream exporter. */
export function stringifyFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) lines.push(`  ${k}: ${quoteIfNeeded(String(v))}`);
    } else {
      lines.push(`${key}: ${quoteIfNeeded(String(value))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function quoteIfNeeded(value) {
  if (/^[\w./@-][\w ./@,()-]*$/.test(value) && !/:\s/.test(value) && !value.endsWith(":")) return value;
  return JSON.stringify(value);
}
