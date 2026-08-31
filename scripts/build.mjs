import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const output = path.join(root, "dist");

await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

const manifestPath = path.join(output, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version must be 3");
}
if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) {
  throw new Error(`Invalid Chrome extension version: ${manifest.version}`);
}

const referencedFiles = [
  manifest.background?.service_worker,
  ...manifest.content_scripts.flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {})
].filter(Boolean);

for (const relativePath of new Set(referencedFiles)) {
  await stat(path.join(output, relativePath));
}

console.log(`Built unpacked extension: ${output}`);
