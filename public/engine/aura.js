// AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027. The rules, shared by the Worker and the page.
// Pure functions only: no network, no storage.
//
// AURA FARM (v0.6). You put a style on the board, sealed: DRIP, RIZZ or MOG (DRIP > RIZZ > MOG > DRIP). While it
// stands untaken you farm aura every hour. Anyone can take it with a style of their own; both are revealed at once
// and the style that beats the other wins. The same style is a draw. Once revealed, every style a player has played
// is public, so a player's record is the thing to read.

// The rules version, written on every ledger record. 4 = v0.6 (one style each). Records with 3 (v0.5: lineups of 3 of
// 5 cards, 19 cards), 2 (v0.4) or none (v0.1-v0.3) are from the card game: see git history to re-deal them.
export const RULES = 4;

export const STYLE = { D: "DRIP", R: "RIZZ", M: "MOG" };
export const EMOJI = { D: "💎", R: "😏", M: "🗿" };
export const BEATS = { D: "R", R: "M", M: "D" };
export const STYLES = Object.keys(STYLE);

export const STAKE = 10000;
export const STAND_PER_HOUR = 1000;
export const MAX_OPEN = 3;
export const RECORD = 10;     // how many of a player's latest styles are shown
export const VIBES_START = 1, VIBES_MAX = 3;

export const isStyle = (s) => STYLES.includes(s);
export const label = (s) => `${EMOJI[s]} ${STYLE[s]}`;

// A farm between two styles. Side 0 is the poster, side 1 the taker. The winner gets the stake and the loser loses it;
// a draw changes nothing. Returns { winner: 0 | 1 | null, how: "win" | "tie", deltas: [a, b] }.
export function farm(a, b) {
  if (!isStyle(a) || !isStyle(b)) throw new Error("farm needs two styles.");
  const winner = BEATS[a] === b ? 0 : BEATS[b] === a ? 1 : null;
  const deltas = [0, 0];
  if (winner !== null) { deltas[winner] = STAKE; deltas[1 - winner] = -STAKE; }
  return { winner, how: winner === null ? "tie" : "win", deltas };
}

// The meme caption for a finished farm, from one side's point of view (side 0 or 1).
export function caption(result, side) {
  const d = result.deltas[side], amt = `${d >= 0 ? "+" : "-"}${Math.abs(d).toLocaleString("en-US")} aura`;
  if (result.winner === null || result.winner === undefined) return "MUTUAL MOG. +0 aura";
  return `${result.winner === side ? "AURA FARMED" : "COOKED"}. ${amt}`;
}

// A player's latest styles, newest first, from their finished farms (rows of { id, style }, any order).
export const record = (rows) => [...rows].sort((a, b) => b.id - a.id).slice(0, RECORD).map((r) => r.style);

// Standing aura: 1,000 an hour while at least one farm stood untaken. spans = [[from, to], ...] in seconds.
// Overlapping farms count once.
export function standing(spans) {
  const s = spans.filter(([f, t]) => t > f).sort((x, y) => x[0] - y[0]);
  let total = 0, cf = null, ct = null;
  for (const [f, t] of s) {
    if (ct === null || f > ct) { if (ct !== null) total += ct - cf; cf = f; ct = t; }
    else if (t > ct) ct = t;
  }
  if (ct !== null) total += ct - cf;
  return Math.floor(total / 3600) * STAND_PER_HOUR;
}
