# espn-fantasy-mcp

This fork adds read-only fantasy football reporting. Start with [Reporting setup](docs/reporting.md). `READ_ONLY=true` is now the default, so write tools below are hidden unless explicitly enabled. HTTP mode is always read-only.


A local MCP server that reads and writes ESPN fantasy sports (football, basketball, baseball) using **your own ESPN session cookies**. It replaces manually driving a browser pane for ESPN: Claude Code or Codex can call its tools directly. No web UI, no cloud, no server — one Node process talking stdio to your AI client, and HTTPS to ESPN.

It does **not** propose, accept, or reject trades. That's out of scope permanently.

---

## Setup (do this once)

These steps are written to be followed exactly, in order — copy-paste the commands.

### 1. Prerequisites

- Node.js 20 or newer (`node --version`)
- An ESPN account that's a member of the fantasy league you want to control
- Git and (optionally) the GitHub CLI (`gh`) if you're cloning from a private repo

### 2. Clone and install

```bash
git clone <this-repo-url> espn-fantasy-mcp
cd espn-fantasy-mcp
npm install
npm run build
```

`npm run build` compiles `src/` to `dist/index.js`, which is what your MCP client will actually launch.

### 3. Get your ESPN cookies

ESPN's fantasy API isn't public — it authenticates the same way your browser does, with two cookies. There is no username/password step; you copy these two values once and they last about a month.

1. Log into `https://fantasy.espn.com` in any browser, and open your league.
2. Open DevTools (F12 or right-click → Inspect).
3. Go to **Application** (Chrome/Edge) or **Storage** (Firefox) → **Cookies** → `https://fantasy.espn.com`.
4. Find the cookie named `espn_s2` — copy its whole value (it's long).
5. Find the cookie named `SWID` — copy its value including the curly braces, e.g. `{ABCDEF12-3456-7890-ABCD-EF1234567890}`.

Never paste these into a chat with an AI assistant, an issue, or a commit. They go in one place only: your local `.env` file, which is already listed in `.gitignore`.

### 4. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
ESPN_S2=<paste the espn_s2 value>
ESPN_SWID=<paste the SWID value, with braces>
ESPN_SPORT=ffl          # ffl = football, fba = basketball, flb = baseball
ESPN_SEASON=2026
ESPN_LEAGUE_ID=<your league id — the number in your league's ESPN URL>
ESPN_TEAM_ID=<your team id in that league>
WRITES_ENABLED=false    # leave false until you've checked dry runs look right
```

Your league id and team id are both visible in the URL when you're looking at your team on fantasy.espn.com (`...leagueId=XXXXXXX...&teamId=N`).

### 5. Sanity-check it runs

```bash
node dist/index.js
```

You should see `espn-fantasy-mcp running (sport=..., season=..., writes disabled (dry run only))` printed to stderr, and the process will sit waiting for stdio input — that's correct for an MCP server. Ctrl+C to stop it. If you see an error about `ESPN_S2 and ESPN_SWID are not set`, go back to step 4.

---

## Connect it to your AI client

### Claude Code

```bash
claude mcp add espn-fantasy -- node /absolute/path/to/espn-fantasy-mcp/dist/index.js --scope user
```

`--scope user` makes it available in every Claude Code session on this machine, not just the current project. Alternatively, drop this in a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "espn-fantasy": {
      "command": "node",
      "args": ["/absolute/path/to/espn-fantasy-mcp/dist/index.js"]
    }
  }
}
```

### Codex

Add to Codex's MCP server config (`~/.codex/config.toml` or equivalent):

```toml
[mcp_servers.espn-fantasy]
command = "node"
args = ["/absolute/path/to/espn-fantasy-mcp/dist/index.js"]
```

Restart Claude Code / Codex after adding the server.

---

## Tools

Every tool takes `sport`, `season`, `league_id` (all default from `.env` if omitted). Write tools also take `team_id`.

### Reads (no confirmation needed, rate-limited to 2/sec, not logged)

| Tool | What it does |
|---|---|
| `get_league` | Settings: scoring, roster slots, acquisition/waiver settings, schedule, trade settings, current scoring period |
| `get_teams` | Team ids, names, owners, records, waiver rank |
| `get_rosters` | Every team's roster (or one `team_id`): player id, name, position, pro team, eligible slots, lineup slot, injury status, lock state, projections |
| `get_free_agents` | Free agents / waiver wire, filterable by slot, sorted by ownership or projection |
| `get_matchups` | A scoring period's matchups: totals and live projections |
| `get_boxscore` | A scoring period's per-player actuals |
| `get_transactions` | Executed transactions (adds, drops, trades, draft picks), most recent first, resolved to player names. Paginated (`limit`/`offset`) — a full season's draft alone can be 100+ records |
| `get_pending` | Pending waiver claims and trade proposals (read-only — this server never acts on trades) |
| `get_player` | Look up a player by id or name search |
| `snapshot` | League state in the line-oriented text format used by `frontoffice-manager`'s `tools/diff-snapshot.mjs` |
| `optimal_lineup` | Suggests a starting lineup (fills the most restrictive slots first, then best remaining projection), ranked by season or a specific scoring period. A heuristic suggestion only — apply it yourself via `set_lineup` if you agree with it |

### Writes (rate-limited to 1 per 5 sec, every real send logged to `logs/writes.jsonl`)

Every write tool takes `dry_run` (default `true`). A dry run validates and reports what *would* be sent without sending it. Setting `dry_run: false` only actually executes if `WRITES_ENABLED=true` in `.env` — otherwise it's still treated as a dry run. After a real write, the tool re-reads the affected state and returns it so you can confirm the change landed.

| Tool | What it does |
|---|---|
| `set_lineup` | Apply a batch of `{player_id, to_slot}` moves. Validates roster membership, slot eligibility, lock state, and the league's slot-count limits before sending anything. |
| `add_free_agent` | Add an unclaimed free agent, optionally dropping another player |
| `waiver_claim` | Submit a waiver claim, optional conditional drop, optional FAAB `bid` |
| `cancel_claim` | Cancel a pending waiver claim by transaction id |
| `move_to_ir` | Move a player to IR/IL (a lineup move to the IR slot) |
| `activate_from_ir` | Move a player out of IR/IL into an active or bench slot |

**Not implemented, ever:** proposing, accepting, or rejecting trades.

---

## Known limits — read before relying on this

- **This uses an undocumented API.** ESPN can change response shapes or payloads at any time without notice; nothing here is officially supported.
- **Cookies expire**, typically after about a month. When a request that used to work starts returning a clear "refresh your cookies" error, go back to step 3 above. The server never retries a 401 and never prints cookie values, even in error messages or logs.
- **`set_lineup` (and the `move_to_ir` / `activate_from_ir` tools built on it) can execute real writes** — the lineup-move payload was captured live on 2026-09-10 (see **The lineup-move payload** below) and is implemented in `buildLineupBody` in `src/espn/writes.ts`, verified in dry run against a real roster.
- **Rate limits are conservative and process-local** (2 reads/sec, 1 write per 5 sec) — fine for one interactive AI client, not built for concurrent callers.
- **The read/write endpoint split matters**: reads go to `lm-api-reads.fantasy.espn.com`, writes to `lm-api-writes.fantasy.espn.com`. Mixing them up produces confusing errors.

### The lineup-move payload

Captured live on 2026-09-10 from a real bench↔FLEX swap. ESPN's lineup UI sends the move as a `ROSTER` transaction with one `LINEUP` item per player whose slot changed — a two-way swap is two items, each carrying *that player's own* prior slot as `fromLineupSlotId`:

```json
{
  "isLeagueManager": false, "teamId": 5, "type": "ROSTER",
  "memberId": "{SWID}", "scoringPeriodId": 1, "executionType": "EXECUTE",
  "items": [
    {"playerId": 4429023, "type": "LINEUP", "fromLineupSlotId": 20, "toLineupSlotId": 23},
    {"playerId": 4568490, "type": "LINEUP", "fromLineupSlotId": 23, "toLineupSlotId": 20}
  ]
}
```

Implemented in `buildLineupBody` in `src/espn/writes.ts`. If ESPN ever changes this shape, re-capture it the same way:

1. Open a fantasy.espn.com team page in a **logged-in** browser, on your team's roster tab.
2. Open DevTools Console and paste an interceptor, then press Enter. **Note:** ESPN's lineup-move request is sent via `XMLHttpRequest`, not `fetch` — a `fetch`-only interceptor (like the one used for the waiver-claim/cancel-claim payloads) will silently miss it. Wrap both:

   ```js
   (function(){
     const of = window.fetch;
     window.fetch = async function(u,o){ try{ if(String(u).includes('lm-api-writes')){ const a=JSON.parse(sessionStorage.ffcap||'[]'); a.push({kind:'fetch',u:String(u),m:o&&o.method,b:o&&o.body}); sessionStorage.ffcap=JSON.stringify(a);} }catch(e){} return of.apply(this,arguments); };
     const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
     XMLHttpRequest.prototype.open = function(method,url){ this.__cap_url=url; this.__cap_method=method; return open.apply(this,arguments); };
     XMLHttpRequest.prototype.send = function(body){ try{ if(this.__cap_url && String(this.__cap_url).includes('lm-api-writes')){ const a=JSON.parse(sessionStorage.ffcap||'[]'); a.push({kind:'xhr',u:String(this.__cap_url),m:this.__cap_method,b:body}); sessionStorage.ffcap=JSON.stringify(a);} }catch(e){} return send.apply(this,arguments); };
   })();
   ```

3. Make **one** lineup move in the UI (drag a player, or use Move/Here) and confirm it.
4. Run `sessionStorage.ffcap` in the console and copy the result.
5. **Redact `espn_s2` and `SWID`** from anything captured before sharing or committing it.

---

## Slot id reference

**Football (ffl):** 0 QB, 2 RB, 4 WR, 6 TE, 23 FLEX, 16 D/ST, 17 K, 20 Bench, 21 IR.

**Basketball (fba):** 0 PG, 1 SG, 2 SF, 3 PF, 4 C, 5 G, 6 F, 7 SG/SF, 8 G/F, 9 PF/C, 10 F/C, 11 UTIL, 12 Bench, 13 IR.

**Baseball (flb):** 0 C, 1 1B, 2 2B, 3 3B, 4 SS, 5 OF, 6 2B/SS, 7 1B/3B, 8 LF, 9 CF, 10 RF, 11 DH, 12 UTIL, 13 P, 14 SP, 15 RP, 16 Bench, 17 IL, 19 IF.

Full tables (including pro-team and stat-id maps) are in `src/espn/constants.ts`.

---

## Development

```bash
npm run build   # compile TypeScript
npm test        # run unit tests (lineup validator, snapshot formatter)
npm start        # run the compiled server directly
npm run dev      # run from source with tsx, no build step
```

Project layout: `src/index.ts` (tool registration and output schemas), `src/espn/client.ts` (HTTP, cookies, rate limiting, 401 handling), `src/espn/constants.ts` (slot/team/position tables), `src/espn/reads.ts` / `src/espn/writes.ts` (API calls and payload building), `src/lineup.ts` (local lineup-move validation), `src/optimalLineup.ts` (the `optimal_lineup` suggestion algorithm), `src/snapshot.ts` (the text snapshot format), `test/` (unit tests, no network).

## Credits

The ESPN v3 fantasy API is undocumented; this project leans on prior reverse-engineering work rather than starting from scratch:

- [cwendt94/espn-api](https://github.com/cwendt94/espn-api) (Python) — the slot/position/pro-team/stat-id constant tables in `src/espn/constants.ts` are ported from here, and the `lineupLocked` roster-entry field used for lock detection was confirmed from its player-parsing code.
- [mkreiser/ESPN-Fantasy-Football-API](https://github.com/mkreiser/ESPN-Fantasy-Football-API) (JavaScript) — read-endpoint client for cross-reference.
- [KBThree13/mcp_espn_ff](https://github.com/KBThree13/mcp_espn_ff) — an existing Python MCP server for ESPN football reads, referenced for tool naming.
- `dylancharris`'s ESPN fantasy basketball MCP (LobeHub listing) — referenced for basketball tool coverage.
- [stmorse's ESPN fantasy v3 API notes](https://stmorse.github.io/journal/espn-fantasy-v3.html) and the `ffscrapr` R package's endpoint vignette — view/endpoint documentation.
- `tlo1216/frontoffice-manager`'s `tools/` scripts (`snapshot-fetch.js`, `espn-cookie-fetch.mjs`, `diff-snapshot.mjs`, and the `espn-*-cheatsheet.md` files) — the source for the exact snapshot line format and the cheat-sheet facts this README and `src/espn/constants.ts` are cross-checked against.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — `@modelcontextprotocol/sdk`, used directly.

## License

MIT. See [LICENSE](LICENSE).

Uses your own ESPN session. Not affiliated with, endorsed by, or supported by ESPN. ESPN's fantasy API is undocumented and unofficial, and automating it may be against ESPN's terms of service. You run this at your own risk.
