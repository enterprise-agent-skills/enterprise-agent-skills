import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { join } from "node:path";
import { readText, walkFiles, rel } from "./fsutil.mjs";
import { REPO_ROOT, PATHS } from "./constants.mjs";

let ajvInstance = null;

/**
 * One Ajv instance with every schema under schemas/ registered. Local schemas are addressed
 * by their path relative to schemas/ (for example "plugin-source.schema.json" or
 * "platform/claude-plugin.schema.json"); vendored Agent Plugins schemas by their $id URL.
 */
function ajv() {
  if (ajvInstance) return ajvInstance;
  ajvInstance = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajvInstance);
  const schemaRoot = join(REPO_ROOT, PATHS.schemas);
  for (const file of walkFiles(schemaRoot)) {
    if (!file.endsWith(".schema.json")) continue;
    const schema = JSON.parse(readText(file));
    const key = schema.$id && schema.$id.startsWith("https://") ? schema.$id : rel(file).replace(/^schemas\//, "");
    if (!ajvInstance.getSchema(key)) ajvInstance.addSchema(schema, key);
  }
  return ajvInstance;
}

/** Validate `data` against a registered schema. Returns an array of readable error strings. */
export function validateSchema(schemaKey, data) {
  const validate = ajv().getSchema(schemaKey);
  if (!validate) throw new Error(`Schema not registered: ${schemaKey}`);
  if (validate(data)) return [];
  return validate.errors.map((e) => {
    const path = e.instancePath || "(root)";
    const extra = e.params && e.params.additionalProperty ? ` '${e.params.additionalProperty}'` : "";
    const allowed = e.params && e.params.allowedValues ? ` (allowed: ${e.params.allowedValues.join(", ")})` : "";
    return `${path} ${e.message}${extra}${allowed}`;
  });
}
