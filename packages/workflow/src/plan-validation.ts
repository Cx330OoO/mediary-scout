import {
  episodePartsFromCode,
  type AcquisitionPlan,
  type AgentDecision,
  type ResourceCandidate,
  type ResourceSnapshot,
} from "./domain.js";

export interface SelectedTransferCandidate {
  candidate: ResourceCandidate;
  episodes: string[];
}

export interface ValidatedAcquisitionPlan {
  selectedSnapshot: ResourceSnapshot | null;
  selectedCandidates: SelectedTransferCandidate[];
}

/**
 * Output contract for the planning agent. The agent is free to judge; this
 * gate makes structurally bad judgments impossible to execute:
 * - the selected snapshot must have been observed in this planning run
 * - the plan must give exactly one disposition for EVERY candidate in the
 *   selected snapshot (silent omission of evidence is rejected)
 * - every selected candidate must map to at least one actionable missing
 *   episode (no just-in-case transfers)
 * - episode codes must belong to the tracked season
 */
export function validateAcquisitionPlan(input: {
  plan: AcquisitionPlan;
  snapshots: ResourceSnapshot[];
  missingEpisodes: string[];
  seasonNumber: number;
}): ValidatedAcquisitionPlan {
  const { plan } = input;
  const observedCandidates = new Map<string, ResourceCandidate>();
  for (const snapshot of input.snapshots) {
    for (const candidate of snapshot.candidates) {
      observedCandidates.set(candidate.id, candidate);
    }
  }

  const seen = new Set<string>();
  for (const disposition of plan.candidateDispositions) {
    if (seen.has(disposition.candidateId)) {
      throw new Error(`Acquisition plan gave more than one disposition for ${disposition.candidateId}`);
    }
    seen.add(disposition.candidateId);
    if (!observedCandidates.has(disposition.candidateId)) {
      throw new Error(
        `Acquisition plan referenced candidate ${disposition.candidateId} that was not observed in this run`,
      );
    }
  }

  if (plan.selectedSnapshotId === null) {
    const selected = plan.candidateDispositions.filter((disposition) => disposition.disposition === "selected");
    if (selected.length > 0) {
      throw new Error("A no-coverage acquisition plan must not contain selected dispositions");
    }
    return { selectedSnapshot: null, selectedCandidates: [] };
  }

  const selectedSnapshot = input.snapshots.find((snapshot) => snapshot.id === plan.selectedSnapshotId);
  if (selectedSnapshot === undefined) {
    throw new Error(
      `Acquisition plan selected snapshot ${plan.selectedSnapshotId} that was not observed in this run`,
    );
  }

  const snapshotCandidateIds = new Set(selectedSnapshot.candidates.map((candidate) => candidate.id));
  for (const disposition of plan.candidateDispositions) {
    if (!snapshotCandidateIds.has(disposition.candidateId)) {
      throw new Error(
        `Acquisition plan disposition for ${disposition.candidateId} is outside the selected snapshot ${selectedSnapshot.id}`,
      );
    }
  }
  const missingDispositions = selectedSnapshot.candidates.filter((candidate) => !seen.has(candidate.id));
  if (missingDispositions.length > 0) {
    throw new Error(
      `Acquisition plan must give a disposition for every candidate in the selected snapshot; missing: ${missingDispositions
        .map((candidate) => candidate.id)
        .join(", ")}`,
    );
  }

  const missing = new Set(input.missingEpisodes);
  const selectedCandidates: SelectedTransferCandidate[] = [];
  for (const candidate of selectedSnapshot.candidates) {
    const disposition = plan.candidateDispositions.find((item) => item.candidateId === candidate.id);
    if (disposition === undefined || disposition.disposition !== "selected") {
      continue;
    }
    if (disposition.episodes.length === 0) {
      throw new Error(`Selected candidate ${candidate.id} has an empty episode mapping`);
    }
    for (const code of disposition.episodes) {
      const parts = episodePartsFromCode(code);
      if (parts.seasonNumber !== input.seasonNumber) {
        throw new Error(
          `Selected candidate ${candidate.id} maps episode ${code} from a different season than season ${input.seasonNumber}`,
        );
      }
    }
    if (!disposition.episodes.some((code) => missing.has(code))) {
      throw new Error(
        `Selected candidate ${candidate.id} does not map to any actionable missing episode (no just-in-case transfers)`,
      );
    }
    selectedCandidates.push({ candidate, episodes: [...disposition.episodes] });
  }

  return { selectedSnapshot, selectedCandidates };
}

export function deriveAgentDecision(input: {
  plan: AcquisitionPlan;
  missingEpisodes: string[];
  latestAiredEpisode: number;
}): AgentDecision {
  const { plan } = input;
  if (plan.selectedSnapshotId === null) {
    throw new Error("Cannot derive an AgentDecision from a no-coverage plan");
  }
  const missing = new Set(input.missingEpisodes);
  const selected = plan.candidateDispositions.filter((disposition) => disposition.disposition === "selected");
  const episodeMapping: Record<string, string[]> = {};
  const providerAheadEpisodeMapping: Record<string, string[]> = {};
  for (const disposition of selected) {
    const missingCovered = disposition.episodes.filter((code) => missing.has(code));
    if (missingCovered.length > 0) {
      episodeMapping[disposition.candidateId] = missingCovered;
    }
    const providerAhead = disposition.episodes.filter(
      (code) => episodePartsFromCode(code).episodeNumber > input.latestAiredEpisode,
    );
    if (providerAhead.length > 0) {
      providerAheadEpisodeMapping[disposition.candidateId] = providerAhead;
    }
  }

  return {
    node: plan.node,
    snapshotId: plan.selectedSnapshotId,
    selectedCandidateIds: selected.map((disposition) => disposition.candidateId),
    episodeMapping,
    providerAheadEpisodeMapping,
    rejectedCandidateIds: plan.candidateDispositions
      .filter((disposition) => disposition.disposition === "rejected")
      .map((disposition) => disposition.candidateId),
    confidence: plan.confidence,
    reason: plan.reason,
  };
}
