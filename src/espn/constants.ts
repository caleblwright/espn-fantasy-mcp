/**
 * Constant tables ported from cwendt94/espn-api (Python, MIT-style usage as a
 * reference project — see README) and cross-checked against this repo's own
 * cheat sheets (`.refs/espn-*-cheatsheet.md`, sourced from tlo1216/frontoffice-manager).
 * ESPN does not publish these; they are reverse-engineered and can drift.
 */

export type Sport = "ffl" | "fba" | "flb";

export const SPORT_NAMES: Record<Sport, string> = {
  ffl: "football",
  fba: "basketball",
  flb: "baseball",
};

// ---------------------------------------------------------------------------
// Football (ffl)
// ---------------------------------------------------------------------------

export const FOOTBALL_LINEUP_SLOT_MAP: Record<number, string> = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  8: "DT",
  9: "DE",
  10: "LB",
  11: "DL",
  12: "CB",
  13: "S",
  14: "DB",
  15: "DP",
  16: "D/ST",
  17: "K",
  18: "P",
  19: "HC",
  20: "BE",
  21: "IR",
  22: "",
  23: "FLEX",
  24: "ER",
  25: "Rookie",
};

export const FOOTBALL_PRO_TEAM_MAP: Record<number, string> = {
  0: "None",
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

export const FOOTBALL_POSITION_MAP: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

// ---------------------------------------------------------------------------
// Basketball (fba)
// ---------------------------------------------------------------------------

export const BASKETBALL_LINEUP_SLOT_MAP: Record<number, string> = {
  0: "PG",
  1: "SG",
  2: "SF",
  3: "PF",
  4: "C",
  5: "G",
  6: "F",
  7: "SG/SF",
  8: "G/F",
  9: "PF/C",
  10: "F/C",
  11: "UTIL",
  12: "BE",
  13: "IR",
  14: "",
  15: "Rookie",
};

export const BASKETBALL_PRO_TEAM_MAP: Record<number, string> = {
  0: "FA",
  1: "ATL",
  2: "BOS",
  3: "NOP",
  4: "CHI",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GSW",
  10: "HOU",
  11: "IND",
  12: "LAC",
  13: "LAL",
  14: "MIA",
  15: "MIL",
  16: "MIN",
  17: "BKN",
  18: "NYK",
  19: "ORL",
  20: "PHL",
  21: "PHO",
  22: "POR",
  23: "SAC",
  24: "SAS",
  25: "OKC",
  26: "UTA",
  27: "WAS",
  28: "TOR",
  29: "MEM",
  30: "CHA",
};

// ---------------------------------------------------------------------------
// Baseball (flb)
// ---------------------------------------------------------------------------

export const BASEBALL_LINEUP_SLOT_MAP: Record<number, string> = {
  0: "C",
  1: "1B",
  2: "2B",
  3: "3B",
  4: "SS",
  5: "OF",
  6: "2B/SS",
  7: "1B/3B",
  8: "LF",
  9: "CF",
  10: "RF",
  11: "DH",
  12: "UTIL",
  13: "P",
  14: "SP",
  15: "RP",
  16: "BE",
  17: "IL",
  19: "IF",
};

export const BASEBALL_DEFAULT_POSITION_MAP: Record<number, string> = {
  1: "SP",
  2: "C",
  3: "1B",
  4: "2B",
  5: "3B",
  6: "SS",
  7: "LF",
  8: "CF",
  9: "RF",
  10: "DH",
  11: "RP",
};

export const BASEBALL_PRO_TEAM_MAP: Record<number, string> = {
  0: "FA",
  1: "Bal",
  2: "Bos",
  3: "LAA",
  4: "ChW",
  5: "Cle",
  6: "Det",
  7: "KC",
  8: "Mil",
  9: "Min",
  10: "NYY",
  11: "Oak",
  12: "Sea",
  13: "Tex",
  14: "Tor",
  15: "Atl",
  16: "ChC",
  17: "Cin",
  18: "Hou",
  19: "LAD",
  20: "Wsh",
  21: "NYM",
  22: "Phi",
  23: "Pit",
  24: "StL",
  25: "SD",
  26: "SF",
  27: "Col",
  28: "Mia",
  29: "Ari",
  30: "TB",
};

// ---------------------------------------------------------------------------
// Per-sport slot map lookup (lineup slot id -> abbreviation)
// ---------------------------------------------------------------------------

export function lineupSlotMap(sport: Sport): Record<number, string> {
  switch (sport) {
    case "ffl":
      return FOOTBALL_LINEUP_SLOT_MAP;
    case "fba":
      return BASKETBALL_LINEUP_SLOT_MAP;
    case "flb":
      return BASEBALL_LINEUP_SLOT_MAP;
  }
}

export function proTeamMap(sport: Sport): Record<number, string> {
  switch (sport) {
    case "ffl":
      return FOOTBALL_PRO_TEAM_MAP;
    case "fba":
      return BASKETBALL_PRO_TEAM_MAP;
    case "flb":
      return BASEBALL_PRO_TEAM_MAP;
  }
}

/** The IR/IL bench slot id used by move_to_ir / activate_from_ir, per sport. */
export const IR_SLOT_ID: Record<Sport, number> = {
  ffl: 21,
  fba: 13,
  flb: 17,
};

export const BENCH_SLOT_ID: Record<Sport, number> = {
  ffl: 20,
  fba: 12,
  flb: 16,
};

export const INJURY_STATUSES = [
  "ACTIVE",
  "QUESTIONABLE",
  "DOUBTFUL",
  "OUT",
  "INJURY_RESERVE",
  "DAY_TO_DAY",
] as const;
