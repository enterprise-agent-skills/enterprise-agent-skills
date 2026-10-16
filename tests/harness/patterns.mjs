/**
 * Pattern semantics match github.com/microsoft/skills scenarios: each entry is a JavaScript
 * regular expression; an entry that is not a valid regex is treated as a literal substring.
 * Regexes are compiled with the multiline flag so ^ and $ match line boundaries.
 *
 * A leading inline flag group sets extra flags: `(?i)` makes the pattern case-insensitive
 * (useful for ABAP, whose keywords are not case-sensitive), `(?s)` lets `.` match line breaks.
 * `m` is always on, so `(?im)` equals `(?i)`. The `(?i)` prefix is also understood by Vally's
 * regex graders.
 */
export function compilePattern(source) {
  let body = source;
  let flags = "m";
  const inline = /^\(\?([ims]+)\)/.exec(body);
  if (inline) {
    body = body.slice(inline[0].length);
    flags = [...new Set(`m${inline[1]}`)].join("");
  }
  try {
    const regex = new RegExp(body, flags);
    return { source, kind: "regex", test: (text) => regex.test(text) };
  } catch {
    return { source, kind: "literal", test: (text) => text.includes(source) };
  }
}

export function checkPatterns(text, expected = [], forbidden = []) {
  const missing = [];
  const present = [];
  for (const p of expected.map(compilePattern)) if (!p.test(text)) missing.push(p.source);
  for (const p of forbidden.map(compilePattern)) if (p.test(text)) present.push(p.source);
  return { missing, present };
}

/** Patterns that match an empty string make a scenario pass without any output. */
export function trivialPatterns(expected = []) {
  return expected.map(compilePattern).filter((p) => p.test("")).map((p) => p.source);
}

/** Entries that fell back to literal matching, reported so authors can fix escaping. */
export function literalFallbacks(patterns = []) {
  return patterns.map(compilePattern).filter((p) => p.kind === "literal").map((p) => p.source);
}
