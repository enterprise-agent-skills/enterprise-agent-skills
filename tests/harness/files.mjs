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

/** Concatenate file contents for pattern matching. */
export function joinForPatterns(split) {
  return [split.preamble, ...split.files.map((f) => f.content)].filter(Boolean).join("\n");
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
