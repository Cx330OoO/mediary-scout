import { generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import type { TaskSandbox } from "./sandbox.js";

/**
 * Phase 3 — the agent loop harness. The strong agent drives its own
 * observe-act-verify loop through the sandbox tools; the system only orchestrates
 * the AI SDK tool-loop and feeds each tool's result (which the sandbox already
 * force-rereads) straight back into the model context. The sandbox stays the
 * permission cage: every guard refusal comes back to the model as `{ error }`
 * text it must read and adapt to — never a crash that aborts the loop.
 */

/** Wrap a sandbox call so a guard refusal becomes evidence, not an exception. */
async function asEvidence(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Build the AI SDK ToolSet that exposes the sandbox to the model. Each tool's
 *  execute drives the sandbox and returns its (already reread) evidence. */
export function buildSandboxToolSet(sandbox: TaskSandbox): ToolSet {
  const tools = {
    searchResources: {
      description:
        "Search the resource provider with ONE keyword. Read-only. Returns the full snapshot of candidates (no slicing). Repeats are deduped; the search budget is capped — decide from gathered evidence when refused.",
      inputSchema: z.object({ keyword: z.string() }),
      execute: (args: { keyword: string }) => asEvidence(() => sandbox.searchResources(args.keyword)),
    },
    inspectStaging: {
      description: "Read-only: the full raw file tree currently in this task's staging. Judge identity/dupes/extras from these real files.",
      inputSchema: z.object({}),
      execute: () => asEvidence(() => sandbox.inspectStaging()),
    },
    inspectStagingDirs: {
      description: "Read-only: the wrapper subdirectories currently in staging — the handles you pass to flattenPack.",
      inputSchema: z.object({}),
      execute: () => asEvidence(() => sandbox.inspectStagingDirs()),
    },
    inspectTargetDir: {
      description: "Read-only: the full raw file tree currently in the scoped target (Season/movie) directory — ground truth for what has landed.",
      inputSchema: z.object({}),
      execute: () => asEvidence(() => sandbox.inspectTargetDir()),
    },
    transferCandidate: {
      description:
        "Transfer ONE snapshot-bound candidate into staging, then read back the TRUE materialized files. The candidate must come from a snapshot you searched this task. Refused once coverage is already met.",
      inputSchema: z.object({ snapshotId: z.string(), candidateId: z.string() }),
      execute: (args: { snapshotId: string; candidateId: string }) =>
        asEvidence(() => sandbox.transferCandidate(args)),
    },
    moveToSeason: {
      description:
        "Move the files you selected out of staging into the scoped Season directory (the extract). Every file must currently be in this task's staging. Rereads both dirs.",
      inputSchema: z.object({ fileIds: z.array(z.string()) }),
      execute: (args: { fileIds: string[] }) => asEvidence(() => sandbox.moveToSeason(args)),
    },
    deleteFiles: {
      description:
        "Delete files you confirmed (dedup keep-larger, or residue) from a named scoped directory. Every id must currently be in that directory. Rereads it.",
      inputSchema: z.object({ directory: z.enum(["staging", "season"]), fileIds: z.array(z.string()) }),
      execute: (args: { directory: "staging" | "season"; fileIds: string[] }) =>
        asEvidence(() => sandbox.deleteFiles(args)),
    },
    flattenPack: {
      description:
        "After extracting target files into the Season dir, remove the now-residual wrapper directory. Only a subdir currently inside this task's staging is allowed.",
      inputSchema: z.object({ directoryId: z.string() }),
      execute: (args: { directoryId: string }) => asEvidence(() => sandbox.flattenPack(args)),
    },
    markObtained: {
      description:
        "Mark episodes obtained. Each must name the backing file (code + fileId); the system rereads the Season dir and refuses any whose file is not present right now.",
      inputSchema: z.object({ episodes: z.array(z.object({ code: z.string(), fileId: z.string() })) }),
      execute: (args: { episodes: Array<{ code: string; fileId: string }> }) =>
        asEvidence(() => sandbox.markObtained(args)),
    },
    finish: {
      description: "Declare the task done. Returns the honest coverage summary (what is obtained, what remains).",
      inputSchema: z.object({}),
      execute: () => asEvidence(() => sandbox.finish()),
    },
    reportNoCoverage: {
      description:
        "Honestly report you cannot cover the target. Valid only after a real search ran; backs the report with real provider evidence.",
      inputSchema: z.object({ reason: z.string() }),
      execute: (args: { reason: string }) => asEvidence(() => sandbox.reportNoCoverage(args.reason)),
    },
  } satisfies ToolSet;
  return tools;
}

export interface AcquisitionAgentRequest {
  sandbox: TaskSandbox;
  model: LanguageModel;
  system: string;
  prompt: string;
  /** Hard ceiling on tool-loop steps (the model still terminates earlier via finish/reportNoCoverage). */
  maxSteps?: number;
}

export interface AcquisitionAgentResult {
  /** The model's final free text (after it stopped calling tools). */
  text: string;
  /** Number of loop steps the model took. */
  steps: number;
  /** Final honest coverage picture, read from the sandbox after the loop. */
  coverage: { coverageMet: boolean; obtained: string[]; missing: string[] };
}

/** Run the strong agent's self-driven loop over the sandbox tools. */
export async function runAcquisitionAgent(
  request: AcquisitionAgentRequest,
): Promise<AcquisitionAgentResult> {
  const tools = buildSandboxToolSet(request.sandbox);
  const result = await generateText({
    model: request.model,
    system: request.system,
    prompt: request.prompt,
    tools,
    stopWhen: stepCountIs(request.maxSteps ?? 40),
  });
  return {
    text: result.text,
    steps: result.steps?.length ?? 0,
    coverage: await request.sandbox.finish(),
  };
}
