import { describe, expect, it } from "vitest";
import {
  deriveAgentDecision,
  validateAcquisitionPlan,
  type AcquisitionPlan,
  type ResourceSnapshot,
} from "../src/index.js";

function snapshotFixture(): ResourceSnapshot {
  return {
    id: "snapshot_1",
    provider: "fake",
    keyword: "翘楚 4K",
    candidates: [
      {
        id: "snapshot_1_candidate_1",
        snapshotId: "snapshot_1",
        index: 0,
        title: "翘楚 S01E13 4K",
        type: "115",
        source: "fake",
        episodeHints: ["S01E13"],
        qualityHints: ["4K"],
        providerPayload: {},
      },
      {
        id: "snapshot_1_candidate_2",
        snapshotId: "snapshot_1",
        index: 1,
        title: "无关资源",
        type: "115",
        source: "fake",
        episodeHints: [],
        qualityHints: [],
        providerPayload: {},
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function planFixture(overrides: Partial<AcquisitionPlan> = {}): AcquisitionPlan {
  return {
    node: "test_planning",
    selectedSnapshotId: "snapshot_1",
    searchedKeywords: ["翘楚 4K"],
    candidateDispositions: [
      {
        candidateId: "snapshot_1_candidate_1",
        disposition: "selected",
        episodes: ["S01E13"],
        reason: "Exact missing episode.",
      },
      {
        candidateId: "snapshot_1_candidate_2",
        disposition: "rejected",
        episodes: [],
        reason: "Wrong target.",
      },
    ],
    confidence: "high",
    reason: "Found exact coverage.",
    ...overrides,
  };
}

describe("validateAcquisitionPlan", () => {
  it("accepts a total, covering plan and returns ordered selected candidates", () => {
    const result = validateAcquisitionPlan({
      plan: planFixture(),
      snapshots: [snapshotFixture()],
      missingEpisodes: ["S01E13"],
      seasonNumber: 1,
    });

    expect(result.selectedSnapshot?.id).toBe("snapshot_1");
    expect(result.selectedCandidates).toHaveLength(1);
    expect(result.selectedCandidates[0]?.candidate.id).toBe("snapshot_1_candidate_1");
    expect(result.selectedCandidates[0]?.episodes).toEqual(["S01E13"]);
  });

  it("rejects a plan whose selected snapshot was not observed in this run", () => {
    expect(() =>
      validateAcquisitionPlan({
        plan: planFixture({ selectedSnapshotId: "snapshot_unseen" }),
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/not observed/);
  });

  it("rejects a plan that does not account for every candidate in the selected snapshot", () => {
    const plan = planFixture();
    plan.candidateDispositions = [plan.candidateDispositions[0]!];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/every candidate/);
  });

  it("rejects duplicate dispositions for one candidate", () => {
    const plan = planFixture();
    plan.candidateDispositions = [
      ...plan.candidateDispositions,
      { candidateId: "snapshot_1_candidate_1", disposition: "rejected", episodes: [], reason: "dup" },
    ];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/more than one disposition/);
  });

  it("rejects a selected candidate that maps to no actionable missing episode", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S01E01"];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/missing episode/);
  });

  it("rejects a selected candidate with an empty episode mapping", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = [];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/empty episode mapping/);
  });

  it("rejects episode codes from a different season", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S02E13", "S01E13"];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/season/);
  });

  it("allows provider-ahead episodes to ride along with a missing-episode mapping", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S01E13", "S01E14"];

    const result = validateAcquisitionPlan({
      plan,
      snapshots: [snapshotFixture()],
      missingEpisodes: ["S01E13"],
      seasonNumber: 1,
    });

    expect(result.selectedCandidates[0]?.episodes).toEqual(["S01E13", "S01E14"]);
  });

  it("accepts a no-coverage plan and forbids selected dispositions inside it", () => {
    const noCoverage = validateAcquisitionPlan({
      plan: planFixture({
        selectedSnapshotId: null,
        candidateDispositions: [
          { candidateId: "snapshot_1_candidate_1", disposition: "rejected", episodes: [], reason: "expired" },
        ],
      }),
      snapshots: [snapshotFixture()],
      missingEpisodes: ["S01E13"],
      seasonNumber: 1,
    });
    expect(noCoverage.selectedSnapshot).toBeNull();
    expect(noCoverage.selectedCandidates).toEqual([]);

    expect(() =>
      validateAcquisitionPlan({
        plan: planFixture({ selectedSnapshotId: null }),
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/no-coverage/);
  });
});

describe("deriveAgentDecision", () => {
  it("derives a persistable AgentDecision split by latest aired episode", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S01E13", "S01E15"];

    const decision = deriveAgentDecision({
      plan,
      missingEpisodes: ["S01E13"],
      latestAiredEpisode: 14,
    });

    expect(decision).toEqual({
      node: "test_planning",
      snapshotId: "snapshot_1",
      selectedCandidateIds: ["snapshot_1_candidate_1"],
      episodeMapping: { snapshot_1_candidate_1: ["S01E13"] },
      providerAheadEpisodeMapping: { snapshot_1_candidate_1: ["S01E15"] },
      rejectedCandidateIds: ["snapshot_1_candidate_2"],
      confidence: "high",
      reason: "Found exact coverage.",
    });
  });

  it("refuses to derive a decision from a no-coverage plan", () => {
    expect(() =>
      deriveAgentDecision({
        plan: planFixture({ selectedSnapshotId: null, candidateDispositions: [] }),
        missingEpisodes: ["S01E13"],
        latestAiredEpisode: 14,
      }),
    ).toThrowError(/no-coverage/);
  });
});
