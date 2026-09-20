import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayer, getFreeAgents, getRosters } from '../src/espn/reads.js';
import { getReportContext } from '../src/report.js';
import { computeOptimalLineup } from '../src/optimalLineup.js';
import { createServer } from '../src/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { EspnPlayer } from '../src/espn/types.js';

const raw: EspnPlayer = { id: 1, fullName: 'Fixture RB', defaultPositionId: 2, proTeamId: 12, eligibleSlots: [2, 20], stats: [{ statSourceId: 1, seasonId: 2026, scoringPeriodId: 4, appliedTotal: 12.37 }] };
const params = { sport: 'ffl' as const, season: 2026, leagueId: '123' };

test('preserves decimal projections and distinguishes missing from a real zero', () => {
  const p = normalizePlayer('ffl', 2026, raw, { periodId: 4 });
  assert.equal(p.periodProjection, 12.37);
  assert.equal(p.seasonProjection, undefined);
  const zero = normalizePlayer('ffl', 2026, { ...raw, stats: [{ ...raw.stats![0], appliedTotal: 0 }] }, { periodId: 4 });
  assert.equal(zero.periodProjection, 0);
  const missing = { ...p, id: 2, periodProjection: undefined };
  const out = { ...p, id: 3, periodProjection: 30, injuryStatus: 'OUT' };
  const ir = { ...p, id: 4, periodProjection: 40, lineupSlotId: 21 };
  const lineup = computeOptimalLineup('ffl', [missing, out, ir], { '2': 1 }, { scoringPeriodId: 4 });
  assert.equal(lineup.starters[0].playerId, null);
  assert.equal(lineup.bench.find(p => p.playerId === 2)?.projection, null);
});

test('current-week requests, scoring settings and report context use fresh fixture data', async (t) => {
  process.env.ESPN_S2 = 'test-only-cookie'; process.env.ESPN_SWID = '{test-only-swid}';
  const requests: URL[] = [];
  const league = {
    id: 123, seasonId: 2026, status: { latestScoringPeriod: 4, currentMatchupPeriod: 4 },
    settings: { scoringSettings: { scoringItems: [{ statId: 53, points: 0.5 }] }, rosterSettings: { lineupSlotCounts: { '2': 1 } } },
    teams: [{ id: 8, name: 'Test Team', owners: ['private-owner'], roster: { entries: [{ lineupSlotId: 2, playerPoolEntry: { player: raw } }] } }],
    schedule: [{ matchupPeriodId: 4, home: { teamId: 8 }, away: { teamId: 9 } }],
  };
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const u = new URL(url); requests.push(u);
    return new Response(JSON.stringify(u.searchParams.getAll('view').includes('kona_player_info') ? { players: [{ player: raw }] } : league));
  });
  const fa = await getFreeAgents(params);
  assert.equal(fa[0].periodProjection, 12.37);
  assert.equal(requests.at(-1)?.searchParams.get('scoringPeriodId'), '4');
  await getRosters(params, 8, 6);
  assert.equal(requests.at(-1)?.searchParams.get('scoringPeriodId'), '6');
  const report = await getReportContext(params, 8);
  assert.equal(report.scoringPeriodId, 4);
  assert.equal(report.myTeam.teamId, 8);
  assert.equal(report.league.scoringSettings?.scoringItems?.[0].points, 0.5);
  assert.equal('owners' in report.teams[0], false);
  assert.equal(report.matchups.length, 1);
  assert.ok(report.warnings.length > 0);
});

test('read-only MCP exposes report tool and rejects write calls', async () => {
  const server = createServer(true);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some(t => t.name === 'get_report_context'));
    for (const name of ['set_lineup', 'add_free_agent', 'waiver_claim', 'cancel_claim', 'move_to_ir', 'activate_from_ir']) {
      assert.ok(!tools.some(t => t.name === name));
    }
    const result = await client.callTool({ name: 'set_lineup', arguments: {} });
    assert.equal(result.isError, true);
  } finally { await client.close(); await server.close(); }
});
