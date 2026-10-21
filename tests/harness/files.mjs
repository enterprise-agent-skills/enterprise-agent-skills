/**
 * Split a model response or reference answer into files.
 *
 * A line such as `// file: src/Handler.cls`, `# file: notebooks/load.py`,
 * `* file: src/zcl_x.clas.abap` or `" file: ...` starts a new file. Marker lines are not
 * part of the file content. Markdown code fences are dropped, and a closing fence ends the
 * current file, so chat-style answers (prose, fenced code, prose) split cleanly. Text outside
 * files is kept as `preamble` and is used only for pattern matching.
 *
 * In skill documentation and acceptance criteria, `* context: <path>` (same comment styles)
 * marks an object that already exists in the system, such as a generated base class. It is
 * returned in `context`, parsed together with the files so references resolve, and never
 * graded. Graders of model answers treat context-marked files as ordinary answer files.
 */
const MARKER = /^\s*(?:\/\/|#|\*|"|--|<!--)\s*(file|context):\s*([^\s>]+)\s*(?:-->)?\s*$/;
const FENCE = /^\s*(```+|~~~+)/;

export function splitIntoFiles(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const files = [];
  const preamble = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      if (inFence && current) current = null;
      inFence = !inFence;
      continue;
    }
    const m = line.match(MARKER);
    if (m) {
      const path = normalizeRelPath(m[2]);
      current = { path, role: m[1], lines: [] };
      files.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  const toFile = (f) => ({ path: f.path, content: trimBlankEdges(f.lines).join("\n") + "\n" });
  return {
    preamble: preamble.join("\n").trim(),
    files: files.filter((f) => f.role === "file").map(toFile),
    context: files.filter((f) => f.role === "context").map(toFile),
  };
}

/** Default file name used when a response has no markers but a validator needs a file. */
export function defaultFileFor(validator) {
  return {
    python: "response.py",
    javascript: "response.mjs",
    json: "response.json",
    yaml: "response.yaml",
    apex: "Response.cls",
  }[validator] ?? null;
}

/**
 * Text that expected and forbidden patterns run on: the prose outside files, then each file's
 * code without comments, so a comment never satisfies or triggers a pattern. Context-marked
 * files count like answer files.
 */
export function joinForPatterns(split) {
  const files = [...split.files, ...(split.context ?? [])];
  return [split.preamble, ...files.map((f) => stripComments(f.content, f.path))].filter(Boolean).join("\n");
}

const C_STYLE_COMMENTS = new Set([".cls", ".trigger", ".js", ".mjs", ".cjs", ".asddls", ".asbdef", ".asddlxs", ".srvdsrv"]);
const BACKSLASH_ESCAPES = new Set([".cls", ".trigger", ".js", ".mjs", ".cjs"]);

/**
 * Remove comments from code for pattern matching. Literal contents stay, because expected
 * patterns match them (for example CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'), and every line
 * break stays, so ^ and $ still match the same lines.
 *
 * - ABAP (.abap): a line that starts with `*` is a comment, except `*"` lines, which carry a
 *   function module's parameter interface; `"` starts a comment outside '...', `...`, and
 *   |...|. A line that ended in a comment loses its trailing blanks.
 * - Apex, JavaScript, and CDS (.cls, .trigger, .js, .mjs, .cjs, .asddls, .asbdef, .asddlxs,
 *   .srvdsrv): `//` to the end of the line and `/* ... *\/` outside string literals.
 * - Python (.py): `#` to the end of the line outside string literals, including
 *   triple-quoted strings.
 * - Any other file is returned unchanged.
 *
 * This is a scanner, not a parser: a JavaScript regular expression literal that contains a
 * quote or `//` can confuse it for the rest of that line.
 */
export function stripComments(content, path) {
  const ext = (String(path).toLowerCase().match(/(\.[a-z0-9]+)$/) ?? [])[1];
  if (ext === ".abap") return stripAbapComments(content);
  if (C_STYLE_COMMENTS.has(ext)) return stripCStyleComments(content, BACKSLASH_ESCAPES.has(ext));
  if (ext === ".py") return stripPythonComments(content);
  return content;
}

function stripAbapComments(content) {
  return content
    .split("\n")
    .map((line) => {
      if (line.startsWith('*"')) return line;
      if (line.startsWith("*")) return "";
      let out = "";
      let quote = null;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          out += c;
          if (quote === "|" && c === "\\" && i + 1 < line.length) out += line[++i];
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"') return out.trimEnd();
        if (c === "'" || c === "`" || c === "|") quote = c;
        out += c;
      }
      return out;
    })
    .join("\n");
}

function popBlanks(out) {
  while (out.length && (out[out.length - 1] === " " || out[out.length - 1] === "\t")) out.pop();
}

function stripCStyleComments(content, backslashEscapes) {
  const out = [];
  let quote = null;
  let block = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];
    if (block) {
      if (c === "*" && next === "/") {
        block = false;
        i++;
      } else if (c === "\n") out.push(c);
      continue;
    }
    if (quote) {
      out.push(c);
      if (backslashEscapes && c === "\\" && i + 1 < content.length) out.push(content[++i]);
      else if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      continue;
    }
    if (c === "/" && next === "/") {
      popBlanks(out);
      while (i + 1 < content.length && content[i + 1] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      // A space keeps the tokens on both sides apart: a/*x*/b must not become ab.
      out.push(" ");
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    out.push(c);
  }
  return out.join("");
}

function stripPythonComments(content) {
  const out = [];
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quote) {
      if (c === "\\" && i + 1 < content.length) {
        out.push(c, content[++i]);
        continue;
      }
      if (content.startsWith(quote, i)) {
        out.push(quote);
        i += quote.length - 1;
        quote = null;
        continue;
      }
      // A single-quoted string cannot span lines; this keeps one broken literal from hiding
      // the comments of every later line.
      if (c === "\n" && quote.length === 1) quote = null;
      out.push(c);
      continue;
    }
    if (c === "#") {
      popBlanks(out);
      while (i + 1 < content.length && content[i + 1] !== "\n") i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = content.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      out.push(quote);
      i += quote.length - 1;
      continue;
    }
    out.push(c);
  }
  return out.join("");
}

export function normalizeRelPath(p) {
  const posix = p.replace(/\\/g, "/").replace(/^\.\//, "");
  if (posix.startsWith("/") || /^[a-zA-Z]:/.test(posix) || posix.split("/").includes("..")) {
    throw new Error(`Unsafe file marker path '${p}': use a relative path without '..'.`);
  }
  return posix;
}

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}
