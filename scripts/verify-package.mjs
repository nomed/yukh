import { access, readFile } from "node:fs/promises";

const required = [
  "action.yml",
  "package.json",
  "src/action-cli.ts",
  "src/connected-runtime.ts",
  "src/runtime.ts",
  "src/project.ts",
  "src/mutation.ts",
  "src/reconcile.ts",
  "src/policy.ts",
  "src/contract.ts",
  "README.md",
  "docs/github-action.md",
];

for (const path of required) await access(path);

const action = await readFile("action.yml", "utf8");
if (!action.includes("src/action-cli.ts")) throw new Error("action.yml does not invoke the packaged runtime");
if (!action.includes("github.action_path")) throw new Error("action.yml must resolve runtime files from github.action_path");
if (action.includes("nomed/yukh@main")) throw new Error("action package must not depend on the moving main branch");

const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error("package version is not semantic");

console.log(`Verified Yukh action package ${pkg.version}: ${required.length} required files present.`);
