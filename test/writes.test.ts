import { test } from "node:test";
import assert from "node:assert/strict";

// buildAddDropBody reads cookies lazily (only when called), so setting these
// before the test body runs is enough — no need to touch .env for this test.
process.env.ESPN_S2 = "test-s2";
process.env.ESPN_SWID = "{TEST-SWID}";

import { buildAddDropBody } from "../src/espn/writes.js";
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

test("redactBody never leaves the real memberId (SWID) in a body that could reach a transcript", () => {
  const body = buildAddDropBody({ type: "WAIVER", teamId: 5, scoringPeriodId: 1, addPlayerId: 111 });
  const redacted = redactBody(body);
  assert.equal(redacted.memberId, "[redacted]");
  assert.notEqual(redacted.memberId, "{TEST-SWID}");
  // every other field is untouched
  assert.equal(redacted.teamId, 5);
  assert.deepEqual(redacted.items, body.items);
});
