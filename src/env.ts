import { readFileSync, existsSync } from "node:fs";
import type { Sport } from "./espn/constants.js";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export interface EspnConfig {
  espnS2: string;
  swid: string;
  defaultSport: Sport;
  defaultSeason: number;
  defaultLeagueId?: string;
  defaultTeamId?: number;
  writesEnabled: boolean;
  readOnly: boolean;
}

let cached: EspnConfig | undefined;

export function loadConfig(): EspnConfig {
  if (cached) return cached;

  const envPath = process.env.ESPN_MCP_ENV || ".env";
  const fileVars = parseEnvFile(envPath);
  const get = (key: string): string | undefined => process.env[key] ?? fileVars[key];

  const espnS2 = get("ESPN_S2") ?? "";
  const swid = get("ESPN_SWID") ?? "";
  const sport = (get("ESPN_SPORT") || "ffl") as Sport;
  const season = Number(get("ESPN_SEASON") || new Date().getFullYear());
  const leagueId = get("ESPN_LEAGUE_ID") || undefined;
  const teamIdRaw = get("ESPN_TEAM_ID");
  const teamId = teamIdRaw ? Number(teamIdRaw) : undefined;
  const readOnly = (get("READ_ONLY") || "true").toLowerCase() !== "false";
  const writesEnabled = !readOnly && (get("WRITES_ENABLED") || "false").toLowerCase() === "true";

  if (!["ffl", "fba", "flb"].includes(sport)) {
    throw new Error(`ESPN_SPORT must be one of ffl, fba, flb (got "${sport}")`);
  }

  cached = {
    espnS2,
    swid,
    defaultSport: sport,
    defaultSeason: season,
    defaultLeagueId: leagueId,
    defaultTeamId: teamId,
    writesEnabled,
    readOnly,
  };
  return cached;
}

export function requireCookies(): { espnS2: string; swid: string } {
  const cfg = loadConfig();
  if (!cfg.espnS2 || !cfg.swid) {
    throw new Error(
      "ESPN_S2 and ESPN_SWID are not set. Add them to your .env (see .env.example) — " +
        "log into fantasy.espn.com, open DevTools > Application > Cookies, and copy both values.",
    );
  }
  return { espnS2: cfg.espnS2, swid: cfg.swid };
}
