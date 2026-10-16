/**
 * Collects validation findings with a consistent shape so every tool can print them,
 * write JSON reports, and emit GitHub Actions annotations the same way.
 */
export class Findings {
  constructor(tool) {
    this.tool = tool;
    this.items = [];
  }

  add(level, code, message, { file = null, line = null } = {}) {
    this.items.push({ level, code, message, file, line });
  }

  error(code, message, where) {
    this.add("error", code, message, where);
  }

  warn(code, message, where) {
    this.add("warning", code, message, where);
  }

  info(code, message, where) {
    this.add("info", code, message, where);
  }

  merge(other) {
    this.items.push(...other.items);
  }

  get errors() {
    return this.items.filter((f) => f.level === "error");
  }

  get warnings() {
    return this.items.filter((f) => f.level === "warning");
  }

  summary() {
    return { tool: this.tool, errors: this.errors.length, warnings: this.warnings.length, info: this.items.filter((f) => f.level === "info").length };
  }

  /** Print to the console. In GitHub Actions, also emit workflow annotations. */
  print({ showInfo = false } = {}) {
    const inActions = process.env.GITHUB_ACTIONS === "true";
    for (const f of this.items) {
      if (f.level === "info" && !showInfo) continue;
      const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "";
      const label = f.level.toUpperCase().padEnd(7);
      console.log(`${label} ${f.code.padEnd(28)} ${where ? `${where}  ` : ""}${f.message}`);
      if (inActions && f.level !== "info") {
        const kind = f.level === "error" ? "error" : "warning";
        const loc = f.file ? ` file=${f.file}${f.line ? `,line=${f.line}` : ""}` : "";
        console.log(`::${kind}${loc}::${escapeAnnotation(`[${f.code}] ${f.message}`)}`);
      }
    }
    const s = this.summary();
    console.log(`\n${this.tool}: ${s.errors} error(s), ${s.warnings} warning(s)`);
  }
}

function escapeAnnotation(text) {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
