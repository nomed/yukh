import { access, readFile } from "node:fs/promises";

const required = [
  "action.yml",
  "package.json",
  "src/action-cli.ts",
  "src/bootstrap.ts",
  "src/connected-runtime.ts",
  "src/runtime.ts",
  "src/project.ts",
  "src/mutation.ts",
  "src/native-governance.ts",
  "src/reconcile.ts",
  "src/policy.ts",
  "src/contract.ts",
  "README.md",
  "docs/github-action.md",
  "docs/project-bootstrap.md",
];

for (const path of required) await access(path);

const action = await readFile("action.yml", "utf8");
if (!action.includes("src/action-cli.ts")) throw new Error("action.yml does not invoke the packaged runtime");
if (!action.includes("github.action_path")) throw new Error("action.yml must resolve runtime files from github.action_path");
if (!action.includes("operation:")) throw new Error("action.yml must expose the operation input");
if (!action.includes("steps.run.outputs.applied")) throw new Error("action.yml must expose the applied mutation count");
if (!action.includes("steps.run.outputs.remaining")) throw new Error("action.yml must expose the remaining mutation count");
if (action.includes("nomed/yukh@main")) throw new Error("action package must not depend on the moving main branch");

const selfDryRun = await readFile(".github/workflows/yukh-self-dry-run.yml", "utf8");
const selfApply = await readFile(".github/workflows/yukh-self-apply.yml", "utf8");
for (const [name, workflow] of [["self dry-run", selfDryRun], ["self apply", selfApply]]) {
  if (!workflow.includes("uses: nomed/yukh@e862f109bb038f8ec0699e42ac2da11c9ef42549")) throw new Error(`${name} must use the verified immutable release`);
  if (workflow.includes("fromJSON(vars.YUKH_PROJECT_NUMBER)")) throw new Error(`${name} must not parse the project variable with fromJSON`);
}

const reusableWorkflow = await readFile(".github/workflows/yukh-reconcile.yml", "utf8");
for (const snippet of [
  "repository: nomed/yukh",
  "ref: e862f109bb038f8ec0699e42ac2da11c9ef42549",
  "path: .yukh-action",
  "uses: ./.yukh-action",
]) {
  if (!reusableWorkflow.includes(snippet)) throw new Error(`reusable workflow is missing: ${snippet}`);
}
if (/^\s*- uses: \.\/$/m.test(reusableWorkflow)) {
  throw new Error("reusable workflow must not invoke the caller repository root as the Yukh action");
}

const releaseWorkflow = await readFile(".github/workflows/release-please.yml", "utf8");
const requiredReleaseSnippets = [
  "id: release",
  "steps.release.outputs.release_created",
  "latest",
  "v${{ steps.release.outputs.major }}",
  "v${{ steps.release.outputs.major }}.${{ steps.release.outputs.minor }}",
  "git push origin \"refs/tags/$tag\" --force",
  "${{ steps.release.outputs.tag_name }}",
  "${{ steps.release.outputs.sha }}",
];

for (const snippet of requiredReleaseSnippets) {
  if (!releaseWorkflow.includes(snippet)) throw new Error(`release workflow is missing required alias-tag logic: ${snippet}`);
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error("package version is not semantic");

console.log(`Verified Yukh action package ${pkg.version}: ${required.length} required files present.`);
