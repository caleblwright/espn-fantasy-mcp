import { BENCH_SLOT_ID, lineupSlotMap, type Sport } from "./espn/constants.js";
import type { NormalizedPlayer } from "./espn/reads.js";

export interface LineupMove {
  playerId: number;
  toSlot: number;
}

export interface MoveRejection {
  playerId: number;
  toSlot: number;
  reason: string;
}

export interface LineupValidationResult {
  valid: boolean;
  accepted: LineupMove[];
  rejected: MoveRejection[];
}

/**
 * Validates a batch of lineup moves against one team's current roster before
 * anything is sent to ESPN. Three checks, in order:
 *   1. every playerId in `moves` is actually on this roster
 *   2. `toSlot` is one of that player's `eligibleSlotIds`
 *   3. the player isn't locked (game already started)
 * A rejection on any one of those short-circuits that move; it does not
 * affect the other moves in the batch.
 */
export function validateLineupMoves(
  sport: Sport,
  roster: NormalizedPlayer[],
  moves: LineupMove[],
  slotCounts: Record<string, number>,
): LineupValidationResult {
  const bySlotName = lineupSlotMap(sport);
  const rosterById = new Map(roster.map((p) => [p.id, p]));
  const accepted: LineupMove[] = [];
  const rejected: MoveRejection[] = [];

  for (const move of moves) {
    const player = rosterById.get(move.playerId);
    if (!player) {
      rejected.push({ ...move, reason: `Player ${move.playerId} is not on this roster.` });
      continue;
    }
    if (player.locked) {
      rejected.push({
        ...move,
        reason: `${player.name} is locked (game already started); cannot move a locked player.`,
      });
      continue;
    }
    if (!player.eligibleSlotIds.includes(move.toSlot)) {
      const slotName = bySlotName[move.toSlot] ?? String(move.toSlot);
      rejected.push({
        ...move,
        reason: `${player.name} is not eligible for slot ${move.toSlot} (${slotName}). Eligible: ${player.eligibleSlotNames.join(", ")}.`,
      });
      continue;
    }
    accepted.push(move);
  }

  return simulateAndCheckSlotCounts(sport, roster, accepted, rejected, slotCounts);
}

/**
 * Applies the whole `accepted` batch to a working copy of the roster's
 * lineup-slot assignments as one combined change (matching how ESPN's own UI
 * submits a lineup edit — a same-batch swap nets to zero on the vacated
 * slot instead of transiently overflowing it), then checks the *final*
 * state against `slotCounts`.
 *
 * If a slot still ends up over its allowed count, only the moves in this
 * batch that targeted that slot are downgraded to rejected — not the whole
 * batch — starting with the last move queued for that slot, until the slot
 * is back within capacity. Moves into other, unaffected slots stay accepted.
 * A slot with no entry in `slotCounts` is treated as unconstrained (some
 * leagues don't use every slot id ESPN defines).
 */
function simulateAndCheckSlotCounts(
  sport: Sport,
  roster: NormalizedPlayer[],
  accepted: LineupMove[],
  rejected: MoveRejection[],
  slotCounts: Record<string, number>,
): LineupValidationResult {
  const bySlotName = lineupSlotMap(sport);
  const workingSlot = new Map(roster.map((p) => [p.id, p.lineupSlotId]));
  for (const move of accepted) workingSlot.set(move.playerId, move.toSlot);

  const finalRejected: MoveRejection[] = [];
  const finalAccepted = [...accepted];

  const countsBySlot = new Map<number, number>();
  for (const slot of workingSlot.values()) {
    if (slot === undefined) continue;
    countsBySlot.set(slot, (countsBySlot.get(slot) ?? 0) + 1);
  }

  for (const [slot, count] of countsBySlot) {
    const allowed = slotCounts[String(slot)];
    if (allowed === undefined || count <= allowed) continue;

    let overflow = count - allowed;
    // Walk this batch's moves into `slot` newest-first, undoing just enough
    // of them to bring the slot back within its cap.
    for (let i = finalAccepted.length - 1; i >= 0 && overflow > 0; i--) {
      const move = finalAccepted[i];
      if (move.toSlot !== slot) continue;
      finalAccepted.splice(i, 1);
      finalRejected.push({
        ...move,
        reason: `Would put ${count} players in slot ${slot} (${bySlotName[slot] ?? slot}), max ${allowed}.`,
      });
      overflow--;
    }
  }

  return {
    valid: rejected.length === 0 && finalRejected.length === 0,
    accepted: finalAccepted,
    rejected: [...rejected, ...finalRejected],
  };
}
