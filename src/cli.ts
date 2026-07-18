import { readFile } from "node:fs/promises";
import type { ObservedProjectState } from "./report.js";
import { buildReadOnlyReport, renderHumanReport, serializeReport } from "./report.js";

async function main(): Promise<void> {
  const [issuePath, policyPath, observedPath] = process.argv.slice(2);
  if (!issuePath || !policyPath) {
    console.error("Usage: yukh-report <issue.md> <project.yaml> [observed.json]");
    process.exitCode = 2;
    return;
  }

  try {
    const issueBody = await readFile(issuePath, "utf8");
    const policySource = await readFile(policyPath, "utf8");
    const observed = observedPath
      ? (JSON.parse(await readFile(observedPath, "utf8")) as unknown)
      : undefined;
    if (observed !== undefined && (observed === null || typeof observed !== "object" || Array.isArray(observed))) {
      throw new Error("observed state must be a JSON object");
    }

    const report = buildReadOnlyReport({
      issueBody,
      policySource,
      ...(observed !== undefined
        ? { observed: observed as Partial<ObservedProjectState> }
        : {}),
      artifact: issuePath,
    });
    console.log(renderHumanReport(report));
    console.log("\n--- JSON ---");
    process.stdout.write(serializeReport(report));
    if (report.status === "error") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

await main();
