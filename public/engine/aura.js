// AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027. The rules, shared by the Worker and the page.
// Pure functions only: no network, no storage. Every number here is from the design doc.
//
// The deck is 19 cards: 6 each of three styles (DRIP > RIZZ > MOG > DRIP) and 1 CAP. No numbers.
// A duel (v0.5): each side keeps 3 of its 5 cards in an order, and the two lineups face off card by card: the style
// that beats the other wins that round (same style draws; the CAP loses to any style). Whoever wins more of the 3
// rounds wins. The only bluff is the order: the poster's 5 are face up, the 3 they kept and their order are not.

// The rules version, written on every ledger record. 3 = v0.5 (lineup vs lineup, 19 cards). Records with 2 (v0.4:
// 20 cards, moves and a pot) or none (v0.1-v0.3: 54 cards) were dealt from older decks: see git history to re-deal.
export const RULES = 3;

export const STYLE = { D: "DRIP", R: "RIZZ", M: "MOG" };
export const EMOJI = { D: "💎", R: "😏", M: "🗿", X: "🤫" };
export const BEATS = { D: "R", R: "M", M: "D" };

export const ROUNDS = 3;
export const STAKE = 10000;
export const BONUS = { totalMog: 100000, noCap: 500000 };
export const STAND_PER_HOUR = 1000;
export const MAX_OPEN = 3;
export const VIBES_START = 1, VIBES_MAX = 3;

// Card codes: "D1".."D6" (DRIP), "R1".."R6" (RIZZ), "M1".."M6" (MOG), "X1" (the CAP). The number only tells
// copies apart: it is not worth anything.
export const DECK = [...Object.keys(STYLE).flatMap((s) => [1, 2, 3, 4, 5, 6].map((n) => s + n)), "X1"];

export const isCap = (c) => c[0] === "X";
export const style = (c) => (isCap(c) ? null : c[0]);
export const label = (c) => (isCap(c) ? `${EMOJI.X} CAP` : `${EMOJI[c[0]]} ${STYLE[c[0]]}`);

// Who wins one face-off: 0 (a), 1 (b) or null (a draw). The CAP loses to any style.
export function faceOff(a, b) {
  if (isCap(a)) return 1;
  if (isCap(b)) return 0;
  return BEATS[style(a)] === style(b) ? 0 : BEATS[style(b)] === style(a) ? 1 : null;
}

// Rounds won by each side over the first n face-offs of two lineups (arrays of card codes).
export function totals(a, b, n = ROUNDS) {
  const won = [0, 0];
  for (let i = 0; i < n; i++) { const w = faceOff(a[i], b[i]); if (w !== null) won[w]++; }
  return won;
}

// sfc32, seeded from 128 bits of hex. Small, fast and the same everywhere.
function rng(hex) {
  let [a, b, c, d] = [0, 8, 16, 24].map((i) => parseInt(hex.slice(i, i + 8), 16) >>> 0);
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; const r = (t + d) | 0; c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

// A duel's deal from its seed: shuffle the 19, the challenger gets the first 5, the taker the next 5.
export function deal(seedHex) {
  if (!/^[0-9a-f]{32,}$/.test(seedHex)) throw new Error("deal needs a hex seed of 128 bits or more.");
  const r = rng(seedHex), d = [...DECK];
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return [d.slice(0, 5), d.slice(5, 10)];
}

// A lineup is 3 different slots (0-4) of a 5-card hand, in play order. Returns the cards, or null if it isn't one.
export function lineupCards(hand, slots) {
  if (!Array.isArray(slots) || slots.length !== ROUNDS || new Set(slots).size !== ROUNDS) return null;
  if (!slots.every((s) => Number.isInteger(s) && s >= 0 && s < hand.length)) return null;
  return slots.map((s) => hand[s]);
}

// A duel between two lineups (arrays of 3 card codes). Side 0 is the poster, side 1 the taker.
// Returns { winner: 0 | 1 | null, how: "win" | "tie", won: [a, b], deltas: [a, b], bonuses: [[name, amount, side], ...] }.
// The winner gets the stake and the loser loses it; a tie changes nothing. Bonuses go to the winner:
// TOTAL MOG for winning all 3 rounds, NO CAP for winning with the CAP in your 3.
export function duel(a, b) {
  const won = totals(a, b);
  const winner = won[0] === won[1] ? null : won[0] > won[1] ? 0 : 1;
  const deltas = [0, 0], bonuses = [];
  if (winner !== null) {
    deltas[winner] += STAKE; deltas[1 - winner] -= STAKE;
    const add = (name) => { bonuses.push([name, BONUS[name], winner]); deltas[winner] += BONUS[name]; };
    if (won[winner] === ROUNDS) add("totalMog");
    if ([a, b][winner].some(isCap)) add("noCap");
  }
  return { winner, how: winner === null ? "tie" : "win", won, deltas, bonuses };
}

// The meme caption for a finished duel, from one side's point of view (side 0 or 1).
export function caption(result, side) {
  const d = result.deltas[side], sign = d >= 0 ? "+" : "-";
  const amt = `${sign}${Math.abs(d).toLocaleString("en-US")} aura`;
  if (result.winner === null || result.winner === undefined) return "MUTUAL MOG. +0 aura";
  const bonus = result.bonuses.filter((x) => x[2] === side).map((x) => x[0]);
  if (bonus.includes("noCap")) return `NO CAP. ${amt}`;
  if (bonus.includes("totalMog")) return `TOTAL MOG. ${amt}`;
  return `${result.winner === side ? "AURA FARMED" : "MOGGED"}. ${amt}`;
}

// Standing aura: 1,000 an hour while at least one challenge stood untaken. spans = [[from, to], ...] in seconds.
// Overlapping challenges count once.
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
