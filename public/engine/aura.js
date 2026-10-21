// AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027. The rules, shared by the Worker and the page.
// Pure functions only: no network, no storage.
//
// AURA FARM (v0.6). You put a style on the board, sealed: DRIP, RIZZ or MOG (DRIP > RIZZ > MOG > DRIP). While it
// stands untaken you farm aura every hour. Anyone can take it with a style of their own; both are revealed at once
// and the style that beats the other wins. The same style is a draw. Once revealed, every style a player has played
// is public, so a player's record is the thing to read.

// The rules version, written on every ledger record. 5 = v0.38 (the win/lose amount and the hourly rate grow with the
// hours a farm stood), 4 = v0.6 (one style each, a flat 100,000). Records with 3 (v0.5: lineups of 3 of
// 5 cards, 19 cards), 2 (v0.4) or none (v0.1-v0.3) are from the card game: see git history to re-deal them.
export const RULES = 5;

export const STYLE = { D: "DRIP", R: "RIZZ", M: "MOG" };
export const EMOJI = { D: "💎", R: "😏", M: "🗿" };
export const BEATS = { D: "R", R: "M", M: "D" };
export const STYLES = Object.keys(STYLE);

export const STAKE = 100000;          // what a farm moves the moment it goes up
export const STAKE_PER_HOUR = 10000;  // and this much more for each whole hour it stood before it was taken
export const STAND_PER_HOUR = 10000;  // what a farm earns in its first hour
export const STAND_STEP = 1000;       // each hour pays this much more than the one before
export const MAX_OPEN = 3;      // farms one player can have up at once
export const LIFE = 24 * 3600;  // a farm stays up 24 hours from when it was posted (v0.15; before, until midnight UTC)
export const RECORD = 10;     // how many of a player's latest styles are shown

export const isStyle = (s) => STYLES.includes(s);

// What a farm moves after it has stood this many whole hours: 100,000, then 10,000 more for every hour.
export const stake = (hours) => STAKE + STAKE_PER_HOUR * hours;
// What a farm has earned by standing this many whole hours: 10,000 for the first, 11,000 for the second, and so on.
export const earned = (hours) => STAND_PER_HOUR * hours + (STAND_STEP * hours * (hours - 1)) / 2;
// What it earns per hour while it is in its next hour, after this many whole hours.
export const rate = (hours) => STAND_PER_HOUR + STAND_STEP * hours;

// A farm between two styles, taken after it stood this many whole hours. Side 0 is the poster, side 1 the taker. The
// winner gets the amount and the loser loses the same; a draw changes nothing. Returns { winner: 0 | 1 | null, how: "win" | "tie", deltas: [a, b] }.
export function farm(a, b, hours = 0) {
  if (!isStyle(a) || !isStyle(b)) throw new Error("farm needs two styles.");
  if (!Number.isInteger(hours) || hours < 0) throw new Error("farm needs whole hours.");
  const winner = BEATS[a] === b ? 0 : BEATS[b] === a ? 1 : null;
  const deltas = [0, 0];
  if (winner !== null) { deltas[winner] = stake(hours); deltas[1 - winner] = -stake(hours); }
  return { winner, how: winner === null ? "tie" : "win", deltas };
}

// The meme caption for a finished farm, from one side's point of view (side 0 or 1).
export function caption(result, side) {
  const d = result.deltas[side], amt = `${d >= 0 ? "+" : "-"}${Math.abs(d).toLocaleString("en-US")} aura`;
  if (result.winner === null || result.winner === undefined) return "MUTUAL MOG. +0 aura";
  return `${result.winner === side ? "AURA FARMED" : "COOKED"}. ${amt}`;
}

// The line that says what happened, shown above the caption and sealed on the ledger with the farm (v0.9). Eight for
// each matchup, picked by the farm's number, so a farm always has the same line. A draw names the style both picked.
// Kept to 40 letters, numbers, spaces and . , ' - so the shared registry takes them.
export const LINES = {
  DR: ["RIZZ drowned in DRIP.", "Too much DRIP. RIZZ slipped.", "RIZZ got iced out.", "The DRIP was too wet for the RIZZ.",
       "RIZZ tried. DRIP shined.", "Can't RIZZ through the DRIP.", "RIZZ got rinsed.", "Dripped on. RIZZ is soaked."],
  RM: ["MOG couldn't handle the RIZZ.", "MOG cracked a smile. It's over.", "The RIZZ cracked the MOG.", "MOG blushed. gg, out-RIZZed.",
       "One RIZZ look and MOG folded.", "MOG got RIZZed up.", "Stone cold MOG til the RIZZ hit.", "MOG fell for the RIZZ."],
  MD: ["DRIP got MOGGED.", "All that DRIP, still got MOGGED.", "MOG didn't blink. DRIP did.", "The DRIP couldn't survive the MOG.",
       "MOG said nothing. DRIP dried up.", "DRIP got stared down by the MOG.", "Cold stare. DRIP melted.", "MOGGED down DRIP."],
  tie: ["{S} met {S}. Respect.", "Same {S}. Same Energy.", "Two {S}S. One Love.", "A {Y} standoff.",
        "{S} vs {S}. Nobody moved.", "Mirror match. No notes.", "Two {S}S. Zero blinks.", "{S} recognizes {S}."],
};
const STYLEY = { D: "DRIPPY", R: "RIZZY", M: "MOGGY" };
export function line([a, b], farmId) {
  const key = a === b ? "tie" : BEATS[a] === b ? a + b : b + a, list = LINES[key];
  return list[farmId % list.length].replaceAll("{S}", STYLE[a]).replaceAll("{Y}", STYLEY[a]);
}

// A player's latest styles, newest first, from their finished farms (rows of { id, style }, any order).
export const record = (rows) => [...rows].sort((a, b) => b.id - a.id).slice(0, RECORD).map((r) => r.style);

// Standing aura: a farm earns by its own age, 10,000 for its first whole hour, 11,000 for its second, and so on. A player
// earns from one farm at a time, the oldest one standing; when it comes down the next oldest carries on from its own age.
// spans = [[from, to, posted], ...] in seconds: the part of each farm inside the period being counted, and when it went up.
// An hour counts when it is finished, so an hour that finishes inside the period is paid inside it.
export function standing(spans) {
  const s = spans.filter(([f, t]) => t > f).sort((x, y) => x[2] - y[2]);
  let total = 0, covered = -Infinity;
  for (const [f, t, p] of s) {
    const from = Math.max(f, covered);
    if (t > from) total += earned(Math.floor((t - p) / 3600)) - earned(Math.floor((from - p) / 3600));
    covered = Math.max(covered, t);
  }
  return total;
}
