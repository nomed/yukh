import { appendFile, readFile } from "node:fs/promises";
import { runProjectBootstrap } from "./bootstrap.js";
import { GitHubGraphqlTransport, runConnectedActionRuntime } from "./connected-runtime.js";

interface EventPayload {
  issue?: { number?: number; body?: string | null };
  repository?: { full_name?: string };
  inputs?: Record<string, string>;
}

async function readEvent(path: string | undefined): Promise<EventPayload> {
  if (!path) return {};
  return JSON.parse(await readFile(path, "utf8")) as EventPayload;
}

function parseProjectNumber(value: string | number | undefined): number {
  return typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
}

async function main(): Promise<void> {
  try {
    const event = await readEvent(process.env.GITHUB_EVENT_PATH);
    const policyPath = process.env.INPUT_POLICY_PATH || ".yukh/project.yaml";
    const policySource = await readFile(policyPath, "utf8");
    const issueBody = process.env.INPUT_ISSUE_BODY || event.issue?.body || undefined;
    const issueNumber = process.env.INPUT_ISSUE_NUMBER || event.issue?.number || event.inputs?.issue_number;
    const projectNumber = process.env.INPUT_PROJECT_NUMBER || event.inputs?.project_number;
    const repository = process.env.GITHUB_REPOSITORY || event.repository?.full_name;
    const operation = process.env.INPUT_OPERATION || event.inputs?.operation || "reconcile-issue";
    const mode = process.env.INPUT_MODE || event.inputs?.mode || "dry-run";
    const applyEnabled = process.env.INPUT_APPLY_ENABLED;
    const token = process.env.GITHUB_TOKEN;

    const outcome = operation === "bootstrap-project"
      ? await runProjectBootstrap({
          policySource,
          projectNumber: parseProjectNumber(projectNumber),
          mode,
          ...(applyEnabled !== undefined ? { applyEnabled } : {}),
          tokenAvailable: Boolean(token?.trim()),
        }, new GitHubGraphqlTransport(token ?? ""))
      : await runConnectedActionRuntime({
          ...(repository !== undefined ? { repository } : {}),
          ...(issueNumber !== undefined ? { issueNumber } : {}),
          ...(projectNumber !== undefined ? { projectNumber } : {}),
          mode,
          policyPath,
          ...(issueBody !== undefined ? { issueBody } : {}),
          policySource,
          ...(applyEnabled !== undefined ? { applyEnabled } : {}),
          ...(token !== undefined ? { token } : {}),
        });

    console.log(outcome.human);
    console.log("\n--- JSON ---");
    process.stdout.write(outcome.json);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, outcome.summary, "utf8");
    }
    if (!outcome.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

await main();
