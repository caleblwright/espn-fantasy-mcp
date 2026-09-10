import { logWrite, postTransaction, redactBody, writesEnabled } from "./client.js";
import { requireCookies } from "../env.js";
import { IR_SLOT_ID, type Sport } from "./constants.js";
import { getLeague, getRosters, type LeagueParams, type NormalizedPlayer } from "./reads.js";
import { validateLineupMoves, type LineupMove, type LineupValidationResult } from "../lineup.js";

export interface WriteOutcome<T> {
  dryRun: boolean;
  wouldSend?: Record<string, unknown>;
  sent?: Record<string, unknown>;
  response?: { status: number; body: unknown };
  verification?: T;
  blockedReason?: string;
}

function memberId(): string {
  return requireCookies().swid;
}

async function currentScoringPeriod(p: LeagueParams): Promise<number> {
  const league = await getLeague(p);
  return league.currentScoringPeriod ?? 1;
}

async function teamRoster(p: LeagueParams, teamId: number): Promise<NormalizedPlayer[]> {
  const rosters = await getRosters(p, teamId);
  if (rosters.length === 0) throw new Error(`No roster found for team ${teamId}.`);
  return rosters[0].players;
}

// ---------------------------------------------------------------------------
// waiver_claim / add_free_agent (same payload shape, different `type`)
// ---------------------------------------------------------------------------

export function buildAddDropBody(opts: {
  type: "WAIVER" | "FREEAGENT";
  teamId: number;
  scoringPeriodId: number;
  addPlayerId: number;
  dropPlayerId?: number;
  bid?: number;
}): Record<string, unknown> {
  const items: Record<string, unknown>[] = [
    { playerId: opts.addPlayerId, type: "ADD", toTeamId: opts.teamId },
  ];
  if (opts.dropPlayerId !== undefined) {
    items.push({ playerId: opts.dropPlayerId, type: "DROP", fromTeamId: opts.teamId });
  }
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: opts.type,
    memberId: memberId(),
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "EXECUTE",
    items,
    bidAmount: opts.type === "WAIVER" ? (opts.bid ?? null) : undefined,
  };
}

async function runAddDrop(
  toolName: string,
  args: unknown,
  p: LeagueParams,
  opts: {
    type: "WAIVER" | "FREEAGENT";
    teamId: number;
    addPlayerId: number;
    dropPlayerId?: number;
    bid?: number;
  },
  dryRun: boolean,
): Promise<WriteOutcome<{ transactions: unknown }>> {
  const scoringPeriodId = await currentScoringPeriod(p);
  const body = buildAddDropBody({ ...opts, scoringPeriodId });

  if (dryRun || !writesEnabled()) {
    return {
      dryRun: true,
      wouldSend: redactBody(body),
      blockedReason: !dryRun && !writesEnabled() ? "WRITES_ENABLED is false; treated as dry run." : undefined,
    };
  }

  const result = await postTransaction(p.sport, p.season, p.leagueId, body);
  const verification = { transactions: await import("./reads.js").then((m) => m.getPending(p)) };
  const resolvedVerification = { transactions: await verification.transactions };
  logWrite(toolName, args, body, result, resolvedVerification);
  return { dryRun: false, sent: redactBody(body), response: result, verification: resolvedVerification };
}

export async function waiverClaim(
  p: LeagueParams,
  args: { teamId: number; addPlayerId: number; dropPlayerId?: number; bid?: number },
  dryRun: boolean,
): Promise<WriteOutcome<{ transactions: unknown }>> {
  return runAddDrop(
    "waiver_claim",
    { ...p, ...args, dryRun },
    p,
    { type: "WAIVER", teamId: args.teamId, addPlayerId: args.addPlayerId, dropPlayerId: args.dropPlayerId, bid: args.bid },
    dryRun,
  );
}

export async function addFreeAgent(
  p: LeagueParams,
  args: { teamId: number; addPlayerId: number; dropPlayerId?: number },
  dryRun: boolean,
): Promise<WriteOutcome<{ transactions: unknown }>> {
  return runAddDrop(
    "add_free_agent",
    { ...p, ...args, dryRun },
    p,
    { type: "FREEAGENT", teamId: args.teamId, addPlayerId: args.addPlayerId, dropPlayerId: args.dropPlayerId },
    dryRun,
  );
}

// ---------------------------------------------------------------------------
// cancel_claim
// ---------------------------------------------------------------------------

export async function cancelClaim(
  p: LeagueParams,
  args: { teamId: number; transactionId: string },
  dryRun: boolean,
): Promise<WriteOutcome<{ pending: unknown }>> {
  const scoringPeriodId = await currentScoringPeriod(p);
  const body: Record<string, unknown> = {
    isLeagueManager: false,
    teamId: args.teamId,
    type: "WAIVER",
    memberId: memberId(),
    scoringPeriodId,
    executionType: "CANCEL",
    relatedTransactionId: args.transactionId,
  };

  if (dryRun || !writesEnabled()) {
    return {
      dryRun: true,
      wouldSend: redactBody(body),
      blockedReason: !dryRun && !writesEnabled() ? "WRITES_ENABLED is false; treated as dry run." : undefined,
    };
  }

  const result = await postTransaction(p.sport, p.season, p.leagueId, body);
  const { getPending } = await import("./reads.js");
  const verification = { pending: await getPending(p) };
  logWrite("cancel_claim", { ...p, ...args }, body, result, verification);
  return { dryRun: false, sent: redactBody(body), response: result, verification };
}

// ---------------------------------------------------------------------------
// set_lineup / move_to_ir / activate_from_ir
//
// Payload shape captured live on 2026-09-10 via the browser fetch/XHR
// interceptor (see README "Capturing the lineup-move payload") from a real
// bench<->FLEX swap: type ROSTER, one LINEUP item per player whose slot
// changed, each carrying its OWN prior slot as fromLineupSlotId — a two-way
// swap sends two items, not one.
// ---------------------------------------------------------------------------

export function buildLineupBody(opts: {
  teamId: number;
  scoringPeriodId: number;
  moves: LineupMove[];
  currentSlots: Map<number, number | undefined>;
}): Record<string, unknown> {
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: "ROSTER",
    memberId: memberId(),
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "EXECUTE",
    items: opts.moves.map((m) => ({
      playerId: m.playerId,
      type: "LINEUP",
      fromLineupSlotId: opts.currentSlots.get(m.playerId) ?? -1,
      toLineupSlotId: m.toSlot,
    })),
  };
}

export async function setLineup(
  p: LeagueParams,
  args: { teamId: number; moves: LineupMove[] },
  dryRun: boolean,
): Promise<WriteOutcome<{ roster: unknown }> & { validation: LineupValidationResult }> {
  const [roster, league] = await Promise.all([teamRoster(p, args.teamId), getLeague(p)]);
  const slotCounts = league.rosterSlotCounts ?? {};
  const validation = validateLineupMoves(p.sport, roster, args.moves, slotCounts);
  const currentSlots = new Map(roster.map((pl) => [pl.id, pl.lineupSlotId]));
  const scoringPeriodId = league.currentScoringPeriod ?? 1;

  if (dryRun || !writesEnabled()) {
    const body = validation.valid
      ? buildLineupBody({ teamId: args.teamId, scoringPeriodId, moves: validation.accepted, currentSlots })
      : undefined;
    return {
      dryRun: true,
      validation,
      wouldSend: body ? redactBody(body) : undefined,
      blockedReason: !dryRun && !writesEnabled() ? "WRITES_ENABLED is false; treated as dry run." : undefined,
    };
  }

  if (!validation.valid) {
    return { dryRun: false, validation, blockedReason: "One or more moves failed validation; nothing was sent." };
  }

  const body = buildLineupBody({ teamId: args.teamId, scoringPeriodId, moves: validation.accepted, currentSlots });

  const result = await postTransaction(p.sport, p.season, p.leagueId, body);
  const verification = { roster: await teamRoster(p, args.teamId) };
  logWrite("set_lineup", { ...p, ...args }, body, result, verification);
  return { dryRun: false, validation, sent: redactBody(body), response: result, verification };
}

export async function moveToIr(
  p: LeagueParams,
  args: { teamId: number; playerId: number },
  dryRun: boolean,
): Promise<ReturnType<typeof setLineup>> {
  return setLineup(p, { teamId: args.teamId, moves: [{ playerId: args.playerId, toSlot: IR_SLOT_ID[p.sport] }] }, dryRun);
}

export async function activateFromIr(
  p: LeagueParams,
  args: { teamId: number; playerId: number; toSlot: number },
  dryRun: boolean,
): Promise<ReturnType<typeof setLineup>> {
  return setLineup(p, { teamId: args.teamId, moves: [{ playerId: args.playerId, toSlot: args.toSlot }] }, dryRun);
}
