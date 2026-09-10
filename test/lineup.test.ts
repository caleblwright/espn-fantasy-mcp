import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLineupMoves } from "../src/lineup.js";
import type { NormalizedPlayer } from "../src/espn/reads.js";

// Football lineup slot ids: 0 QB, 2 RB, 4 WR, 6 TE, 23 FLEX, 16 D/ST, 17 K, 20 Bench, 21 IR.
const FOOTBALL_SLOT_COUNTS = { "0": 1, "2": 2, "4": 3, "6": 1, "23": 2, "16": 1, "17": 1, "20": 6, "21": 1 };

function player(overrides: Partial<NormalizedPlayer> & { id: number }): NormalizedPlayer {
  return {
    name: `Player ${overrides.id}`,
    position: "RB",
    proTeam: "KC",
    eligibleSlotIds: [2, 23, 20],
    eligibleSlotNames: ["RB", "FLEX", "BE"],
    lineupSlotId: 20,
    lineupSlotName: "BE",
    locked: false,
    seasonProjection: 100,
    ...overrides,
  };
}

test("rejects a move for a player not on the roster", () => {
  const roster = [player({ id: 1 })];
  const result = validateLineupMoves("ffl", roster, [{ playerId: 999, toSlot: 2 }], FOOTBALL_SLOT_COUNTS);
  assert.equal(result.valid, false);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /not on this roster/);
});

test("rejects a move of a locked player", () => {
  const roster = [player({ id: 1, locked: true, lineupSlotId: 20 })];
  const result = validateLineupMoves("ffl", roster, [{ playerId: 1, toSlot: 2 }], FOOTBALL_SLOT_COUNTS);
  assert.equal(result.valid, false);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /locked/);
});

test("rejects a move to a slot the player isn't eligible for", () => {
  // A running back is not eligible for the QB slot (0).
  const roster = [player({ id: 1, eligibleSlotIds: [2, 23, 20], eligibleSlotNames: ["RB", "FLEX", "BE"] })];
  const result = validateLineupMoves("ffl", roster, [{ playerId: 1, toSlot: 0 }], FOOTBALL_SLOT_COUNTS);
  assert.equal(result.valid, false);
  assert.match(result.rejected[0].reason, /not eligible/);
});

test("accepts a valid swap between two bench-eligible players", () => {
  const roster = [
    player({ id: 1, lineupSlotId: 2, eligibleSlotIds: [2, 23, 20], eligibleSlotNames: ["RB", "FLEX", "BE"] }),
    player({ id: 2, lineupSlotId: 20, eligibleSlotIds: [2, 23, 20], eligibleSlotNames: ["RB", "FLEX", "BE"] }),
  ];
  const moves = [
    { playerId: 1, toSlot: 20 },
    { playerId: 2, toSlot: 2 },
  ];
  const result = validateLineupMoves("ffl", roster, moves, FOOTBALL_SLOT_COUNTS);
  assert.equal(result.valid, true);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
});

test("rejects a move that would overflow a slot's allowed count", () => {
  // Two RBs already start (slot 2, max 2); moving a third player into RB overflows it.
  const roster = [
    player({ id: 1, lineupSlotId: 2 }),
    player({ id: 2, lineupSlotId: 2 }),
    player({ id: 3, lineupSlotId: 20 }),
  ];
  const result = validateLineupMoves("ffl", roster, [{ playerId: 3, toSlot: 2 }], FOOTBALL_SLOT_COUNTS);
  assert.equal(result.valid, false);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /max 2/);
});

test("accepts a same-batch swap that nets to zero change in the vacated slot", () => {
  // Slot 2 (RB, max 2) starts with players 1 and 2. Move player 3 (bench) into
  // RB while player 1 moves out to bench in the same batch — final RB count
  // stays at 2, so this must not be rejected as an overflow.
  const roster = [
    player({ id: 1, lineupSlotId: 2 }),
    player({ id: 2, lineupSlotId: 2 }),
    player({ id: 3, lineupSlotId: 20 }),
  ];
  const moves = [
    { playerId: 1, toSlot: 20 },
    { playerId: 3, toSlot: 2 },
  ];
  const result = validateLineupMoves("ffl", roster, moves, FOOTBALL_SLOT_COUNTS);
  assert.equal(result.valid, true);
  assert.equal(result.accepted.length, 2);
});
