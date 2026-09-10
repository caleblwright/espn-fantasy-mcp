import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig, requireCookies } from "../env.js";
import type { Sport } from "./constants.js";

const READS_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games";
const WRITES_BASE = "https://lm-api-writes.fantasy.espn.com/apis/v3/games";

export class EspnApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EspnApiError";
  }
}

function cookieHeader(): string {
  const { espnS2, swid } = requireCookies();
  return `espn_s2=${espnS2}; SWID=${swid}`;
}

function authErrorMessage(): string {
  return (
    "ESPN rejected the request with 401 Unauthorized. Your ESPN_S2 / ESPN_SWID cookies " +
    "have likely expired (they last about a month). Log into fantasy.espn.com again, " +
    "open DevTools > Application (or Storage) > Cookies, copy fresh values for `espn_s2` " +
    "and `SWID` into your .env, and retry. Do not paste them into chat."
  );
}

// --- simple serial rate limiters -------------------------------------------
// Reads: 2/sec (500ms spacing). Writes: 1 per 5s. Both are a single queue per
// process — plenty for one interactive MCP client — rather than a token
// bucket, since this server only ever serves one caller at a time over stdio.

function makeLimiter(minIntervalMs: number) {
  let last = 0;
  let chain: Promise<void> = Promise.resolve();
  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = Math.max(0, last + minIntervalMs - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return fn();
    };
    const result = chain.then(run);
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const scheduleRead = makeLimiter(500);
const scheduleWrite = makeLimiter(5000);

async function rawFetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers });
  if (res.status === 401) throw new EspnApiError(authErrorMessage(), 401);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EspnApiError(
      `ESPN API request failed with status ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
      res.status,
    );
  }
  return res.json();
}

/** GET a fantasy read endpoint. Rate limited to 2/sec; retries once on network error. */
export async function getJson(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const url = `${READS_BASE}${path}`;
  const headers = { Cookie: cookieHeader(), ...(extraHeaders || {}) };
  return scheduleRead(async () => {
    try {
      return await rawFetchJson(url, headers);
    } catch (err) {
      if (err instanceof EspnApiError) throw err;
      // one retry on network-level errors only (not on 401/4xx/5xx)
      return await rawFetchJson(url, headers);
    }
  });
}

export function leaguePath(sport: Sport, season: number, leagueId: string, query: string): string {
  return `/${sport}/seasons/${season}/segments/0/leagues/${leagueId}${query}`;
}

export interface WriteResult {
  status: number;
  body: unknown;
}

/**
 * POST to the transactions endpoint. Never retried (a retried write could
 * double-submit a claim). Every call is logged to logs/writes.jsonl with
 * memberId (== SWID) redacted, regardless of outcome.
 */
export async function postTransaction(
  sport: Sport,
  season: number,
  leagueId: string,
  body: Record<string, unknown>,
): Promise<WriteResult> {
  const url = `${WRITES_BASE}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}/transactions/`;
  const headers = {
    Cookie: cookieHeader(),
    "Content-Type": "application/json",
    "X-Fantasy-Source": "kona",
    "X-Fantasy-Platform": "kona-PROD-1dc03f0c30f6b4a75f2b5dc4bad9f4d75c1c1a13",
    Origin: "https://fantasy.espn.com",
    Referer: "https://fantasy.espn.com/",
  };

  const result = await scheduleWrite(async () => {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    let responseBody: unknown;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = await res.text().catch(() => "");
    }
    return { status: res.status, body: responseBody };
  });

  if (result.status === 401) throw new EspnApiError(authErrorMessage(), 401);
  return result;
}

/**
 * Redacts memberId (== SWID, one of the two auth cookies) from a request
 * body. Applied both to what's persisted in logs/writes.jsonl AND to what
 * write tools hand back to the calling MCP client — the client's output can
 * end up in a transcript, so "never print cookie values" has to cover it too.
 */
export function redactBody(body: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...body };
  if ("memberId" in clone) clone.memberId = "[redacted]";
  return clone;
}

/**
 * Appends one line to logs/writes.jsonl for a write tool invocation that
 * actually sent a request (dry runs are not logged — nothing was sent).
 * Called by the write tool handlers once verification has completed, so the
 * verification result lands in the same log line as the request/response.
 */
export function logWrite(
  toolName: string,
  args: unknown,
  requestBody: Record<string, unknown>,
  result: WriteResult,
  verification: unknown,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    args,
    requestBody: redactBody(requestBody),
    responseStatus: result.status,
    responseBody: result.body,
    verification,
  };
  const logPath = "logs/writes.jsonl";
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

export function writesEnabled(): boolean {
  return loadConfig().writesEnabled;
}
