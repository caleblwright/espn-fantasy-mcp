import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOptimalLineup } from "../src/optimalLineup.js";
import type { NormalizedPlayer } from "../src/espn/reads.js";

// Football: 0 QB, 2 RB, 4 WR, 23 FLEX, 20 BE.
const SLOT_COUNTS = { "0": 1, "2": 2, "4": 1, "23": 1, "20": 3 };

function player(overrides: Partial<NormalizedPlayer> & { id: number; name: string; seasonProjection: number; eligibleSlotIds: number[] }): NormalizedPlayer {
  return {
    position: "RB",
    proTeam: "KC",
    eligibleSlotNames: [],
    lineupSlotId: 20,
    locked: false,
    ...overrides,
  };
}

test("fills the most restrictive slot (QB) first, then flex from the best remaining RB/WR", () => {
  const roster = [
    player({ id: 1, name: "QB1", seasonProjection: 300, eligibleSlotIds: [0, 20] }),
    player({ id: 2, name: "RB1", seasonProjection: 250, eligibleSlotIds: [2, 23, 20] }),
    player({ id: 3, name: "RB2", seasonProjection: 200, eligibleSlotIds: [2, 23, 20] }),
    player({ id: 4, name: "RB3", seasonProjection: 150, eligibleSlotIds: [2, 23, 20] }),
    player({ id: 5, name: "WR1", seasonProjection: 180, eligibleSlotIds: [4, 23, 20] }),
    player({ id: 6, name: "WR2", seasonProjection: 50, eligibleSlotIds: [4, 23, 20] }),
  ];

  const result = computeOptimalLineup("ffl", roster, SLOT_COUNTS);

  const bySlot = Object.fromEntries(result.starters.map((s) => [s.slotId, s.playerName]));
  assert.equal(bySlot[0], "QB1");
  assert.equal(bySlot[4], "WR1");
  // Both RB slots go to the top two RBs, and FLEX goes to the third RB
  // (150) over the second WR (50) — flex fills from the best remainder.
  const rbStarters = result.starters.filter((s) => s.slotId === 2).map((s) => s.playerName).sort();
  assert.deepEqual(rbStarters, ["RB1", "RB2"]);
  assert.equal(bySlot[23], "RB3");

  assert.deepEqual(
    result.bench.map((b) => b.name),
    ["WR2"],
  );
});

test("a locked player already starting keeps their slot even if a better option is on the bench", () => {
  const roster = [
    player({ id: 1, name: "QB1", seasonProjection: 300, eligibleSlotIds: [0, 20] }),
    player({ id: 2, name: "RB-locked-starting", seasonProjection: 50, eligibleSlotIds: [2, 23, 20], locked: true, lineupSlotId: 2 }),
    player({ id: 3, name: "RB-better-on-bench", seasonProjection: 300, eligibleSlotIds: [2, 23, 20], lineupSlotId: 20 }),
  ];
  const result = computeOptimalLineup("ffl", roster, { "0": 1, "2": 1, "20": 5 });
  const rbSlot = result.starters.find((s) => s.slotId === 2);
  assert.equal(rbSlot?.playerName, "RB-locked-starting");
  assert.equal(rbSlot?.locked, true);
  assert.equal(rbSlot?.isChange, false);
});

test("a locked bench player is never suggested into a starting slot", () => {
  const roster = [
    player({ id: 1, name: "RB-locked-bench", seasonProjection: 400, eligibleSlotIds: [2, 23, 20], locked: true, lineupSlotId: 20 }),
    player({ id: 2, name: "RB-unlocked-worse", seasonProjection: 50, eligibleSlotIds: [2, 23, 20], lineupSlotId: 20 }),
  ];
  const result = computeOptimalLineup("ffl", roster, { "2": 1, "20": 5 });
  const rbSlot = result.starters.find((s) => s.slotId === 2);
  assert.equal(rbSlot?.playerName, "RB-unlocked-worse");
  // the locked bench player still shows up in the bench listing, just never as a starter
  assert.ok(result.bench.some((b) => b.name === "RB-locked-bench"));
});

test("period mode ranks a player with no projection for that period as 0, not by season total", () => {
  const roster = [
    player({ id: 1, name: "Starter-this-week", seasonProjection: 10, periodProjection: 15, eligibleSlotIds: [2, 20] }),
    player({ id: 2, name: "Bye-week-stud", seasonProjection: 300, periodProjection: undefined, eligibleSlotIds: [2, 20] }),
  ];
  const result = computeOptimalLineup("ffl", roster, { "2": 1, "20": 5 }, { scoringPeriodId: 5 });
  assert.equal(result.usingPeriodProjection, true);
  const rbSlot = result.starters.find((s) => s.slotId === 2);
  assert.equal(rbSlot?.playerName, "Starter-this-week");
});
