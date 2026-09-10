import { BENCH_SLOT_ID, IR_SLOT_ID, lineupSlotMap, type Sport } from "./espn/constants.js";
import type { NormalizedPlayer } from "./espn/reads.js";

export interface SlotAssignment {
  slotId: number;
  slotName: string;
  playerId: number | null;
  playerName: string | null;
  projection: number | null;
  currentSlotId?: number;
  isChange: boolean;
  locked?: boolean;
}

export interface OptimalLineupResult {
  usingPeriodProjection: boolean;
  starters: SlotAssignment[];
  bench: Array<{ playerId: number; name: string; projection: number; locked?: boolean }>;
}

/**
 * Greedy "fill the most restrictive slots first" suggestion, per the
 * cheat sheets: rank each starting slot by how many roster players are even
 * eligible for it (fewer options = fill first), then within a slot take the
 * highest-projection player still available. This is a heuristic, not a
 * guaranteed-optimal assignment (that's a bipartite matching problem) — but
 * it's the same approach the cheat sheets describe by hand for football
 * ("QB, RB, WR, TE, D/ST, K, then flex from the best remainder") and
 * basketball/baseball ("most restrictive slots first"), generalized so it
 * doesn't need a hardcoded slot order per sport.
 *
 * Locked players are never reassigned: one already in a starting slot keeps
 * it, and one on the bench is excluded from the fill pool entirely — set_lineup
 * would refuse to move either, since their game has already started.
 */
export function computeOptimalLineup(
  sport: Sport,
  roster: NormalizedPlayer[],
  slotCounts: Record<string, number>,
  opts: { scoringPeriodId?: number } = {},
): OptimalLineupResult {
  const slotNames = lineupSlotMap(sport);
  const usingPeriodProjection = opts.scoringPeriodId !== undefined;
  const bench = BENCH_SLOT_ID[sport];
  const ir = IR_SLOT_ID[sport];

  const projectionOf = (p: NormalizedPlayer) => (usingPeriodProjection ? (p.periodProjection ?? 0) : p.seasonProjection);
  const isStartSlot = (slotId: number | undefined) => slotId !== undefined && slotId !== bench && slotId !== ir;

  const slotInstances: number[] = [];
  for (const [slotIdStr, count] of Object.entries(slotCounts)) {
    const slotId = Number(slotIdStr);
    if (slotId === bench || slotId === ir || count <= 0) continue;
    for (let i = 0; i < count; i++) slotInstances.push(slotId);
  }

  const available = new Map(roster.map((p) => [p.id, p]));
  const assignedIds = new Set<number>();
  const starters: SlotAssignment[] = [];

  // Pass 1: locked players. One already starting keeps its slot and is
  // removed from that slot's instance pool. One locked on the bench just
  // can't be picked at all — pull it from `available` before the greedy
  // fill runs, but leave it out of `assignedIds` so it still shows up under
  // `bench` in the result.
  for (const p of roster) {
    if (!p.locked) continue;
    if (isStartSlot(p.lineupSlotId)) {
      const idx = slotInstances.indexOf(p.lineupSlotId as number);
      if (idx !== -1) slotInstances.splice(idx, 1);
      available.delete(p.id);
      assignedIds.add(p.id);
      starters.push({
        slotId: p.lineupSlotId as number,
        slotName: slotNames[p.lineupSlotId as number] ?? String(p.lineupSlotId),
        playerId: p.id,
        playerName: p.name,
        projection: projectionOf(p),
        currentSlotId: p.lineupSlotId,
        isChange: false,
        locked: true,
      });
    } else {
      available.delete(p.id);
    }
  }

  // Pass 2: greedy fill. Restrictiveness (eligible-count among what's left)
  // is recomputed each iteration, since assigning a player shrinks the pool
  // for every other slot that shares eligibility with them.
  while (slotInstances.length > 0) {
    let bestSlotIdx = -1;
    let bestEligibleCount = Infinity;
    for (let i = 0; i < slotInstances.length; i++) {
      const slotId = slotInstances[i];
      const eligibleCount = [...available.values()].filter((p) => p.eligibleSlotIds.includes(slotId)).length;
      if (eligibleCount < bestEligibleCount) {
        bestEligibleCount = eligibleCount;
        bestSlotIdx = i;
      }
    }
    const slotId = slotInstances.splice(bestSlotIdx, 1)[0];
    const pick = [...available.values()]
      .filter((p) => p.eligibleSlotIds.includes(slotId))
      .sort((a, b) => projectionOf(b) - projectionOf(a))[0];

    if (!pick) {
      starters.push({ slotId, slotName: slotNames[slotId] ?? String(slotId), playerId: null, playerName: null, projection: null, isChange: false });
      continue;
    }

    available.delete(pick.id);
    assignedIds.add(pick.id);
    starters.push({
      slotId,
      slotName: slotNames[slotId] ?? String(slotId),
      playerId: pick.id,
      playerName: pick.name,
      projection: projectionOf(pick),
      currentSlotId: pick.lineupSlotId,
      isChange: pick.lineupSlotId !== slotId,
      locked: pick.locked,
    });
  }

  starters.sort((a, b) => a.slotId - b.slotId);

  const bench_ = roster
    .filter((p) => !assignedIds.has(p.id))
    .sort((a, b) => projectionOf(b) - projectionOf(a))
    .map((p) => ({ playerId: p.id, name: p.name, projection: projectionOf(p), locked: p.locked }));

  return { usingPeriodProjection, starters, bench: bench_ };
}
