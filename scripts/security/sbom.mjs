#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const output = process.argv[2] ?? join(root, "sbom/axis-aaa.cdx.json");

const raw = execFileSync("pnpm", ["list", "-r", "--json", "--depth=Infinity"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const projects = JSON.parse(raw);
const components = new Map();

function walk(dependencies) {
  if (!dependencies) return;
  for (const [name, value] of Object.entries(dependencies)) {
    const version = typeof value?.version === "string" ? value.version : null;
    if (version) components.set(`${name}@${version}`, { type: "library", name, version });
    if (value?.dependencies) walk(value.dependencies);
  }
}

for (const project of Array.isArray(projects) ? projects : [projects]) {
  walk(project.dependencies);
  walk(project.devDependencies);
}

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "Áxis AAA", name: "scripts/security/sbom.mjs", version: "1" }],
    component: { type: "application", name: "axis-aaa", version: "0.1.0" },
  },
  components: [...components.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  ),
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(bom, null, 2)}\n`, { mode: 0o644 });
console.log(`SBOM gerado: ${output} (${bom.components.length} componentes)`);
