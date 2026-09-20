import { getFreeAgents, getLeague, getMatchups, getRosters, getTeams, type LeagueParams } from './espn/reads.js';

export async function getReportContext(p: LeagueParams, teamId: number, requestedPeriod?: number) {
  if (p.sport !== 'ffl') throw new Error('Report context currently supports football only.');
  if (!Number.isInteger(teamId) || teamId < 1) throw new Error('Set ESPN_TEAM_ID or pass team_id.');
  const startedAt = new Date().toISOString();
  const league = await getLeague(p);
  const period = requestedPeriod ?? league.currentScoringPeriod;
  if (!Number.isInteger(period) || (period ?? 0) < 1) throw new Error('No active week. Supply scoring_period_id.');
  const [rosters, teams, freeAgents, matchups] = await Promise.all([
    getRosters(p, undefined, period), getTeams(p),
    getFreeAgents(p, { scoringPeriodId: period, limit: 200, sortBy: 'projection' }),
    getMatchups(p, period!),
  ]);
  const myTeam = rosters.find(t => t.teamId === teamId);
  if (!myTeam) throw new Error('The selected team was not found in this league.');
  const warnings: string[] = [
    'Free agents are a top-200 ownership candidate pool, not an exhaustive list. Use positional queries for deeper searches.',
    'Missing projections are unknown, not zero. Season totals are not rest-of-season trade values.',
    'FAAB remaining balances, bye weeks, kickoff times and detailed injury/usage news are not verified by this report. Verify before advising exact bids or lineup deadlines.',
    'This snapshot uses several requests and is not atomic. Recheck availability before acting.',
  ];
  if (!league.scoringSettings) warnings.push('Scoring settings unavailable: do not assume PPR, half-PPR or standard.');
  const missing = [...myTeam.players, ...freeAgents].filter(p => p.periodProjection === undefined).map(p => p.id);
  if (missing.length) warnings.push(`${missing.length} selected-team/available-player records lack weekly projections.`);
  return {
    startedAt, fetchedAt: new Date().toISOString(), sport: p.sport, season: p.season,
    leagueId: p.leagueId, teamId, scoringPeriodId: period, league, myTeam,
    teams: teams.map(({ owners, ...team }) => team),
    otherRosters: rosters.filter(t => t.teamId !== teamId).map(t => ({
      ...t, players: t.players.map(({ eligibleSlotNames, eligibleSlotIds, ...player }) => player),
    })),
    freeAgents, matchups: matchups.filter(m => m.home?.teamId === teamId || m.away?.teamId === teamId),
    warnings, missingWeeklyProjectionPlayerIds: missing,
  };
}
