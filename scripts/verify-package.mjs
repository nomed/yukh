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

const releaseWorkflow = await readFile(".github/workflows/release-please.yml", "utf8");
for (const snippet of [
  "id: release",
  "steps.release.outputs.release_created",
  "latest",
  "v${{ steps.release.outputs.major }}",
  "v${{ steps.release.outputs.major }}.${{ steps.release.outputs.minor }}",
  "git push origin \"refs/tags/$tag\" --force",
  "${{ steps.release.outputs.tag_name }}",
  "${{ steps.release.outputs.sha }}",
]) {
  if (!releaseWorkflow.includes(snippet)) throw new Error(`release workflow is missing required alias-tag logic: ${snippet}`);
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error("package version is not semantic");

console.log(`Verified Yukh action package ${pkg.version}: ${required.length} required files present.`);