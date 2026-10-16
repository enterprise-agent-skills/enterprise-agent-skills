import { dirname, join } from "node:path";
import { REPO_ROOT } from "../constants.mjs";
import { exists, readText, rel, walkFiles } from "../fsutil.mjs";
import { isExternal, markdownLinks } from "../markdown.mjs";

/**
 * Relative links in every Markdown file must resolve. External links are checked separately
 * on a schedule (npm run links:external) because network failures should not block a PR.
 * The incubator holds legacy drafts, so its broken links are warnings.
 */
export function checkMarkdownLinks(findings) {
  let checked = 0;
  for (const absFile of walkFiles(REPO_ROOT)) {
    if (!absFile.endsWith(".md")) continue;
    const file = rel(absFile);
    const advisory = file.startsWith("incubator/");
    const text = readText(absFile);
    for (const { target, line } of markdownLinks(text)) {
      if (isExternal(target) || target.startsWith("#")) continue;
      checked++;
      const clean = decodeURIComponent(target.split("#")[0].split("?")[0]);
      if (!clean) continue;
      const resolved = clean.startsWith("/") ? join(REPO_ROOT, clean) : join(dirname(absFile), clean);
      if (!exists(resolved)) {
        const msg = `Broken relative link: ${target}`;
        if (advisory) findings.warn("LINK_BROKEN_INCUBATOR", msg, { file, line });
        else findings.error("LINK_BROKEN", msg, { file, line });
      }
    }
  }
  return { checked };
}

/** Collect external URLs for the scheduled link checker. */
export function externalLinks() {
  const out = new Map();
  for (const absFile of walkFiles(REPO_ROOT)) {
    if (!absFile.endsWith(".md") || rel(absFile).startsWith("incubator/")) continue;
    for (const { target } of markdownLinks(readText(absFile))) {
      if (/^https?:/i.test(target) && !target.includes("YOUR-GITHUB-ORG")) {
        if (!out.has(target)) out.set(target, []);
        out.get(target).push(rel(absFile));
      }
    }
  }
  return out;
}
