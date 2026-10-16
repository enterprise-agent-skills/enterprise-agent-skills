/**
 * Small Markdown helpers. Deliberately simple: fenced code blocks and inline links are all the
 * validators need, and a full Markdown parser would add a dependency for no gain.
 */

/**
 * Fenced code blocks with language, start line (1-based), and directives from HTML comments on
 * the two lines before the fence:
 *   <!-- snippet-lint: skip reason -->            -> block.directive
 *   <!-- abap-env: product=ecc release=ehp7 ... --> -> block.env
 */
export function fencedBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let open = null;
  let lint = { value: null, line: -10 };
  let env = { value: null, line: -10 };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      if (new RegExp(`^${open.fence}\\s*$`).test(line.trim())) {
        blocks.push({ lang: open.lang, code: open.body.join("\n"), line: open.line, directive: open.directive, env: open.env });
        open = null;
      } else {
        open.body.push(line);
      }
      continue;
    }
    const m = line.match(/^(\s*)(```+|~~~+)\s*([\w+-]*)/);
    if (m) {
      const directive = i - lint.line <= 2 ? lint.value : null;
      const envValue = i - env.line <= 2 ? env.value : null;
      open = { fence: m[2], lang: (m[3] || "").toLowerCase(), body: [], line: i + 1, directive, env: envValue };
      continue;
    }
    const c = line.match(/<!--\s*(snippet-lint:[^>]*?)\s*-->/);
    if (c) lint = { value: c[1], line: i };
    const e = line.match(/<!--\s*abap-env:\s*([^>]*?)\s*-->/);
    if (e) env = { value: e[1], line: i };
  }
  return blocks;
}

/**
 * Blank out fenced code blocks and inline code so link extraction ignores code samples.
 * Newlines are kept so reported line numbers still match the source file.
 */
export function stripCode(text) {
  return text
    .replace(/(^|\n)(```+|~~~+)[\s\S]*?\n\2[^\n]*/g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/`[^`\n]*`/g, "");
}

/** Inline Markdown links and images: [text](target). Returns { target, line }. */
export function markdownLinks(text) {
  const clean = stripCode(text.replace(/\r\n/g, "\n"));
  const out = [];
  const lines = clean.split("\n");
  const re = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  lines.forEach((line, idx) => {
    let m;
    while ((m = re.exec(line)) !== null) out.push({ target: m[1], line: idx + 1 });
  });
  return out;
}

export function isExternal(target) {
  return /^(https?:|mailto:|tel:|data:)/i.test(target);
}
