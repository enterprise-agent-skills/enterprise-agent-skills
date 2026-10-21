import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { REPO_ROOT, PATHS, OWNER_PLACEHOLDER } from "./constants.mjs";
import { exists, isDir, listDirs, readText, rel, walkFiles } from "./fsutil.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";

/**
 * Load everything the tools need from disk. Parsing problems are recorded in
 * `model.loadErrors` instead of throwing, so validation can report all of them at once.
 */
export function loadRepository() {
  const loadErrors = [];
  const config = loadYaml(PATHS.config, loadErrors);
  const mcpRegistry = loadYaml(PATHS.mcpRegistry, loadErrors) ?? { servers: [] };
  const plugins = listDirs(join(REPO_ROOT, PATHS.plugins)).map((dir) => loadPlugin(dir, loadErrors));
  const scenarios = loadScenarios(loadErrors);
  const skills = plugins.flatMap((p) => p.skills);
  return { config, mcpRegistry, plugins, skills, scenarios, loadErrors };
}

export function repoUrls(config) {
  const owner = config?.repository?.owner ?? OWNER_PLACEHOLDER;
  const name = config?.repository?.name ?? "enterprise-agent-skills";
  const branch = config?.repository?.default_branch ?? "main";
  const base = `https://github.com/${owner}/${name}`;
  return {
    owner,
    name,
    slug: `${owner}/${name}`,
    repo: base,
    tree: (path) => `${base}/tree/${branch}/${path}`,
    blob: (path) => `${base}/blob/${branch}/${path}`,
  };
}

function loadYaml(relPath, loadErrors) {
  const path = join(REPO_ROOT, relPath);
  if (!exists(path)) {
    loadErrors.push({ file: relPath, message: "File not found." });
    return null;
  }
  try {
    return parseYaml(readText(path), { prettyErrors: true });
  } catch (err) {
    loadErrors.push({ file: relPath, message: `Invalid YAML: ${err.message.split("\n")[0]}` });
    return null;
  }
}

function loadPlugin(dirName, loadErrors) {
  const dir = join(REPO_ROOT, PATHS.plugins, dirName);
  const sourcePath = `${PATHS.plugins}/${dirName}/plugin.yaml`;
  const source = exists(join(REPO_ROOT, sourcePath)) ? loadYaml(sourcePath, loadErrors) : null;
  if (!source) loadErrors.push({ file: sourcePath, message: "Every plugin folder needs a plugin.yaml source manifest." });

  const skills = listDirs(join(dir, "skills")).map((skillDir) => loadSkill(dirName, skillDir, loadErrors));
  const agentsDir = join(dir, "agents");
  const agents = isDir(agentsDir)
    ? walkFiles(agentsDir)
        .filter((f) => f.endsWith(".agent.md"))
        .map((f) => {
          const parsed = parseFrontmatter(readText(f));
          return { file: rel(f), fileName: f.split(/[\\/]/).pop(), ...parsed };
        })
    : [];

  return { dirName, dir, relDir: `${PATHS.plugins}/${dirName}`, sourcePath, source, skills, agents };
}

function loadSkill(pluginDir, skillDir, loadErrors) {
  const dir = join(REPO_ROOT, PATHS.plugins, pluginDir, "skills", skillDir);
  const relDir = rel(dir);
  const skillFile = join(dir, "SKILL.md");
  if (!exists(skillFile)) {
    loadErrors.push({ file: `${relDir}/SKILL.md`, message: "Skill folder has no SKILL.md." });
    return { dirName: skillDir, plugin: pluginDir, dir, relDir, file: `${relDir}/SKILL.md`, text: "", data: null, body: "", error: "missing" };
  }
  const text = readText(skillFile);
  const parsed = parseFrontmatter(text);
  const files = walkFiles(dir).map((f) => rel(f).slice(relDir.length + 1));
  return { dirName: skillDir, plugin: pluginDir, dir, relDir, file: `${relDir}/SKILL.md`, text, files, ...parsed };
}

function loadScenarios(loadErrors) {
  const root = join(REPO_ROOT, PATHS.scenarios);
  const out = {};
  for (const skill of listDirs(root)) {
    if (skill.startsWith("_")) continue;
    const base = `${PATHS.scenarios}/${skill}`;
    const criteriaPath = join(REPO_ROOT, base, "acceptance-criteria.md");
    const scenariosPath = `${base}/scenarios.yaml`;
    out[skill] = {
      skill,
      dir: base,
      criteriaFile: `${base}/acceptance-criteria.md`,
      criteriaText: exists(criteriaPath) ? readText(criteriaPath) : null,
      scenariosFile: scenariosPath,
      data: exists(join(REPO_ROOT, scenariosPath)) ? loadYaml(scenariosPath, loadErrors) : null,
      vallyFile: `${base}/vally/eval.yaml`,
      hasVally: exists(join(REPO_ROOT, base, "vally", "eval.yaml")),
    };
  }
  return out;
}

/** Lookup helpers built from repo.config.yaml. */
export function taxonomy(config) {
  const ids = (list) => new Set((list ?? []).map((x) => x.id));
  const names = (list) => Object.fromEntries((list ?? []).map((x) => [x.id, x.name ?? x.id]));
  return {
    vendors: ids(config?.vendors),
    vendorNames: names(config?.vendors),
    categories: ids(config?.categories),
    categoryNames: names(config?.categories),
    maturity: ids(config?.maturity_levels),
    platforms: config?.platforms ?? [],
  };
}
