/**
 * Parse tests/scenarios/<skill>/acceptance-criteria.md.
 *
 * Convention (compatible with the github.com/microsoft/skills loader, which detects the
 * words "Correct" and "Incorrect"):
 *
 *   ## 2. Authentication
 *   ### 2.1 Correct: environment-based credentials
 *   ```python
 *   ...
 *   ```
 *   ### 2.2 Incorrect: hardcoded secret
 *   ```python
 *   ...
 *   ```
 *
 * Every fenced block under a `###` heading inherits that heading's verdict. A block under an
 * "Incorrect" heading may be preceded by `<!-- not-detectable: reason -->` to document why no
 * automated check can catch it; such blocks are reported but do not fail coverage.
 *
 * A block may also be preceded by `<!-- abap-env: product=ecc release=ehp6 database=anydb -->`
 * to validate it against a specific SAP environment instead of the skill default.
 */
export function parseCriteria(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let section = null;
  let heading = null;
  let verdict = null;
  let exemption = null;
  let envDirective = null;
  let inFence = false;
  let fenceLang = "";
  let fenceStart = 0;
  let buffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFence) {
      if (/^```\s*$/.test(line)) {
        blocks.push({ section, heading, verdict, lang: fenceLang, code: buffer.join("\n"), line: fenceStart, exemption, env: envDirective });
        inFence = false;
        buffer = [];
        exemption = null;
        envDirective = null;
      } else {
        buffer.push(line);
      }
      continue;
    }
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      inFence = true;
      fenceLang = fence[1] || "";
      fenceStart = i + 1;
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2 && !line.startsWith("###")) {
      section = h2[1].trim();
      heading = null;
      verdict = null;
      exemption = null;
      envDirective = null;
      continue;
    }
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      heading = h3[1].trim();
      verdict = classify(heading);
      exemption = null;
      envDirective = null;
      continue;
    }
    const ex = line.match(/<!--\s*not-detectable:\s*(.+?)\s*-->/);
    if (ex) exemption = ex[1];
    const env = line.match(/<!--\s*abap-env:\s*(.+?)\s*-->/);
    if (env) envDirective = env[1];
  }

  return {
    blocks,
    correct: blocks.filter((b) => b.verdict === "correct"),
    incorrect: blocks.filter((b) => b.verdict === "incorrect"),
    unclassified: blocks.filter((b) => b.verdict === null),
  };
}

function classify(heading) {
  if (/\bincorrect\b|\banti-pattern\b|\bwrong\b/i.test(heading)) return "incorrect";
  if (/\bcorrect\b/i.test(heading)) return "correct";
  return null;
}
