// AURA FARMING SIMULATOR: LOCKED IN BATTLE EDITION 2027. The rules, shared by the Worker and the page.
// Pure functions only: no network, no storage.
//
// AURA FARM (v0.6). You put a style on the board, sealed: DRIP, RIZZ or MOG (DRIP > RIZZ > MOG > DRIP). While it
// stands untaken you farm aura every hour. Anyone can take it with a style of their own; both are revealed at once
// and the style that beats the other wins. The same style is a draw. Once revealed, every style a player has played
// is public, so a player's record is the thing to read.

// The rules version, written on every ledger record. 7 = v0.91 (farming earns 50,000 an hour, was 10,000), 6 = v0.90 (every win/lose amount five times bigger: 500,000 and 50,000 an hour),
// 5 = v0.38 (the win/lose amount and the hourly rate grow with the
// hours a farm stood), 4 = v0.6 (one style each, a flat 100,000). Records with 3 (v0.5: lineups of 3 of
// 5 cards, 19 cards), 2 (v0.4) or none (v0.1-v0.3) are from the card game: see git history to re-deal them.
export const RULES = 7;

export const STYLE = { D: "DRIP", R: "RIZZ", M: "MOG" };
export const EMOJI = { D: "💎", R: "😏", M: "🗿" };
export const BEATS = { D: "R", R: "M", M: "D" };
export const STYLES = Object.keys(STYLE);

export const STAKE = 500000;          // what a farm moves the moment it goes up
export const STAKE_PER_HOUR = 50000;  // and this much more for each whole hour it stood before it was taken
export const STAND_PER_HOUR = 50000;  // what a farm earns for each whole hour it stands
export const MAX_OPEN = 3;      // farms one player can have up at once
export const FLEX_PER_FARM = 1;  // each farm you have up lets you FLEX this many times in any FLEX_WINDOW
export const FLEX_WINDOW = 1800;   // seconds: 30 minutes (was 3600)
export const LIFE = 24 * 3600;  // a farm stays up 24 hours from when it was posted (v0.15; before, until midnight UTC)
export const RECORD = 10;     // how many of a player's latest styles are shown

export const isStyle = (s) => STYLES.includes(s);

// The profile pics a player can pick from (v0.47). Until they pick one, the page picks one of these from their name.
export const PICS = ["😎", "🤠", "🥸", "😈", "🤡", "👻", "🧌", "🦝", "🐸", "🐢", "🦊", "🐙", "🤖", "👽", "🧙", "🥷", "🧛", "🧑‍🚀", "🤓", "😼", "🦄", "🐲", "🦖", "🧃"];
export const isPic = (p) => PICS.includes(p);

// What a farm moves after it has stood this many whole hours: 500,000, then 50,000 more for every hour (100,000 and 10,000 before v0.90).
export const stake = (hours) => STAKE + STAKE_PER_HOUR * hours;
// What a farm has earned by standing this many whole hours: a flat 50,000 for each (10,000 before v0.91).
export const earned = (hours) => STAND_PER_HOUR * hours;

// What a player can FLEX right now: each farm up lets them FLEX FLEX_PER_FARM times in any FLEX_WINDOW. `up` is how many farms they
// have up, `taken` when (in seconds) their FLEXes happened, `t` is now. Returns how many are ready and, when none is, the seconds
// until the next one frees up. The Worker refuses a FLEX with this and the page shows it on the FLEX button, so the rule is here once.
export function flexState(up, taken, t) {
  const cap = up * FLEX_PER_FARM, recent = taken.filter((x) => x > t - FLEX_WINDOW).sort((a, b) => a - b);
  const ready = Math.max(0, cap - recent.length);
  return { ready, wait: ready > 0 || cap === 0 ? 0 : recent[recent.length - cap] + FLEX_WINDOW - t };
}

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
  const d = result.deltas[side], amt = `${d >= 0 ? "+" : "-"}${Math.abs(d).toLocaleString("en-US")} AURA`;
  if (result.winner === null || result.winner === undefined) return "MUTUAL MOG. +0 AURA";
  return `${result.winner === side ? "AURA FARMED" : "COOKED"}. ${amt}`;
}

// The line that says what happened, shown above the caption and sealed on the ledger with the farm (v0.9). Eight for
// each matchup (three for DRIP over RIZZ), picked by the farm's number, so a farm always has the same line. A draw names the style both picked.
// Kept to 40 letters, numbers, spaces and . , ' - so the shared registry takes them.
export const LINES = {
  DR: ["RIZZ got iced out.", "RIZZ tried. DRIP shined.", "Can't RIZZ through the DRIP."],
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

// Standing aura: a farm earns 50,000 for each whole hour of its own age. A player
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
