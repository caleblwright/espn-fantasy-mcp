import { test } from "node:test";
import assert from "node:assert/strict";

// buildAddDropBody reads cookies lazily (only when called), so setting these
// before the test body runs is enough — no need to touch .env for this test.
process.env.ESPN_S2 = "test-s2";
process.env.ESPN_SWID = "{TEST-SWID}";

import { buildAddDropBody, buildLineupBody } from "../src/espn/writes.js";
import { redactBody } from "../src/espn/client.js";

test("waiver claim payload matches the shape captured from the live site on 2026-09-08", () => {
  const body = buildAddDropBody({
    type: "WAIVER",
    teamId: 5,
    scoringPeriodId: 1,
    addPlayerId: 4428557,
    dropPlayerId: 4686658,
  });
  assert.deepEqual(body, {
    isLeagueManager: false,
    teamId: 5,
    type: "WAIVER",
    memberId: "{TEST-SWID}",
    scoringPeriodId: 1,
    executionType: "EXECUTE",
    items: [
      { playerId: 4428557, type: "ADD", toTeamId: 5 },
      { playerId: 4686658, type: "DROP", fromTeamId: 5 },
    ],
    bidAmount: null,
  });
});

test("free agent add omits bidAmount and can be add-only", () => {
  const body = buildAddDropBody({
    type: "FREEAGENT",
    teamId: 5,
    scoringPeriodId: 3,
    addPlayerId: 111,
  });
  assert.deepEqual(body, {
    isLeagueManager: false,
    teamId: 5,
    type: "FREEAGENT",
    memberId: "{TEST-SWID}",
    scoringPeriodId: 3,
    executionType: "EXECUTE",
    items: [{ playerId: 111, type: "ADD", toTeamId: 5 }],
    bidAmount: undefined,
  });
});

test("FAAB bid is carried through on a waiver claim", () => {
  const body = buildAddDropBody({
    type: "WAIVER",
    teamId: 5,
    scoringPeriodId: 1,
    addPlayerId: 111,
    bid: 12,
  });
  assert.equal(body.bidAmount, 12);
});

test("lineup swap payload matches the shape captured from the live site on 2026-09-10", () => {
  // Real capture: RJ Harvey (bench, slot 20) <-> MarShawn Lloyd (FLEX, slot 23).
  const body = buildLineupBody({
    teamId: 5,
    scoringPeriodId: 1,
    moves: [
      { playerId: 4429023, toSlot: 23 },
      { playerId: 4568490, toSlot: 20 },
    ],
    currentSlots: new Map([
      [4429023, 20],
      [4568490, 23],
    ]),
  });
  assert.deepEqual(body, {
    isLeagueManager: false,
    teamId: 5,
    type: "ROSTER",
    memberId: "{TEST-SWID}",
    scoringPeriodId: 1,
    executionType: "EXECUTE",
    items: [
      { playerId: 4429023, type: "LINEUP", fromLineupSlotId: 20, toLineupSlotId: 23 },
      { playerId: 4568490, type: "LINEUP", fromLineupSlotId: 23, toLineupSlotId: 20 },
    ],
  });
});

test("lineup body falls back to -1 for fromLineupSlotId when a player's current slot isn't known", () => {
  const body = buildLineupBody({
    teamId: 5,
    scoringPeriodId: 1,
    moves: [{ playerId: 1, toSlot: 20 }],
    currentSlots: new Map(),
  });
  assert.equal((body.items as unknown[])[0] && (body.items as { fromLineupSlotId: number }[])[0].fromLineupSlotId, -1);
});

test("redactBody never leaves the real memberId (SWID) in a body that could reach a transcript", () => {
  const body = buildAddDropBody({ type: "WAIVER", teamId: 5, scoringPeriodId: 1, addPlayerId: 111 });
  const redacted = redactBody(body);
  assert.equal(redacted.memberId, "[redacted]");
  assert.notEqual(redacted.memberId, "{TEST-SWID}");
  // every other field is untouched
  assert.equal(redacted.teamId, 5);
  assert.deepEqual(redacted.items, body.items);
});
