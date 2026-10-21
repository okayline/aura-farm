// AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027. The rules, shared by the Worker and the page.
// Pure functions only: no network, no storage. Every number here is from the design doc.
//
// The deck is 20 cards: 6 each of three styles (DRIP > RIZZ > MOG > DRIP) and 2 CAPs. No numbers (v0.4).
// A duel: each side keeps 3 of its 5 cards in an order. Each round the two cards face off and the style that beats
// the other wins the round (same style, or two CAPs, is a draw; a CAP loses to any style). Each round both sides
// play LOCK IN, FARM or DIP, then the round's cards flip. After round 3, whoever won more rounds wins the pot.

// The rules version, written on every ledger record from v0.4. Records without it used the old 54-card deck
// (suits as four styles, ranks as aura 1-5): see git history before v0.4 to re-deal them.
export const RULES = 2;

export const STYLE = { D: "DRIP", R: "RIZZ", M: "MOG" };
export const EMOJI = { D: "💎", R: "😏", M: "🗿", X: "🤫" };
export const BEATS = { D: "R", R: "M", M: "D" };

export const MOVES = ["lock", "farm", "dip"];
export const START_POT = 10000;
export const ROUNDS = 3;
export const BONUS = { noCap: 500000, dippedWinner: -100000, crashedOut: -1000000 };
export const STAND_PER_HOUR = 1000;
export const MAX_OPEN = 3;
export const VIBES_START = 1, VIBES_MAX = 3;

// Card codes: "D1".."D6" (DRIP), "R1".."R6" (RIZZ), "M1".."M6" (MOG), "X1"/"X2" (CAPs). The number only tells
// copies apart: it is not worth anything.
export const DECK = [...Object.keys(STYLE).flatMap((s) => [1, 2, 3, 4, 5, 6].map((n) => s + n)), "X1", "X2"];

export const isCap = (c) => c[0] === "X";
export const style = (c) => (isCap(c) ? null : c[0]);
export const label = (c) => (isCap(c) ? `${EMOJI.X} CAP` : `${EMOJI[c[0]]} ${STYLE[c[0]]}`);

// Who wins one face-off: 0 (a), 1 (b) or null (a draw). A CAP loses to any style; two CAPs draw.
export function faceOff(a, b) {
  if (isCap(a) || isCap(b)) return isCap(a) && isCap(b) ? null : isCap(a) ? 1 : 0;
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

// A duel's deal from its seed: shuffle the 20, the challenger gets the first 5, the taker the next 5.
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

// Play out a duel's moves. a, b = the two lineups (cards); moves = [[aMove, bMove], ...] one pair per finished round.
// Returns where it stands: { round (1-based, the round being picked), pot, flipped, over, result? }.
// result = { winner: 0 | 1 | null, how, deltas: [a, b], bonuses: [[name, amount, side], ...] }
export function play(a, b, moves) {
  let pot = START_POT, flipped = 0;
  const farmed = [0, 0];
  for (const [ma, mb] of moves) {
    if (!MOVES.includes(ma) || !MOVES.includes(mb)) throw new Error("Bad move.");
    if (ma === "dip" || mb === "dip") {
      if (ma === "dip" && mb === "dip") return done(a, b, { winner: null, how: "both_dip", pot, flipped, farmed });
      return done(a, b, { winner: ma === "dip" ? 1 : 0, how: "dip", pot, flipped, farmed });
    }
    if (ma === "farm") farmed[0]++;
    if (mb === "farm") farmed[1]++;
    if (ma === "farm" || mb === "farm") pot *= 2;      // doubles at most once a round
    flipped++;
    if (flipped === ROUNDS) {
      const [x, y] = totals(a, b);
      return done(a, b, { winner: x === y ? null : x > y ? 0 : 1, how: x === y ? "tie" : "showdown", pot, flipped, farmed });
    }
  }
  return { round: flipped + 1, pot, flipped, over: false };
}

function done(a, b, { winner, how, pot, flipped, farmed }) {
  const deltas = [0, 0], bonuses = [];
  const hands = [a, b];
  if (winner !== null) {
    const loser = 1 - winner;
    deltas[winner] += pot; deltas[loser] -= pot;
    const add = (name, side) => { bonuses.push([name, BONUS[name], side]); deltas[side] += BONUS[name]; };
    if (hands[winner].some(isCap)) add("noCap", winner);
    if (how === "dip") {
      // dipped holding the winning hand
      const [x, y] = totals(a, b);
      if ((loser === 0 && x > y) || (loser === 1 && y > x)) add("dippedWinner", loser);
    }
    // farmed every round, then lost to a CAP at the showdown
    if (how === "showdown" && farmed[loser] === ROUNDS && hands[winner].some(isCap)) add("crashedOut", loser);
  }
  return { round: flipped + 1, pot, flipped, over: true, result: { winner, how, deltas, bonuses } };
}

// The meme caption for a finished duel, from one side's point of view (side 0 or 1).
export function caption(result, side) {
  const d = result.deltas[side], sign = d >= 0 ? "+" : "-";
  const amt = `${sign}${Math.abs(d).toLocaleString("en-US")} aura`;
  const mine = result.bonuses.filter((x) => x[2] === side).map((x) => x[0]);
  if (mine.includes("crashedOut")) return `CRASHED OUT. ${amt}`;
  if (mine.includes("noCap")) return `NO CAP. ${amt}`;
  if (mine.includes("dippedWinner")) return `DIPPED HOLDING THE WIN. ${amt}`;
  if (result.how === "tie") return "MUTUAL MOG. +0 aura";
  if (result.how === "both_dip") return "BOTH DIPPED. +0 aura";
  if (result.winner === side) return `${result.how === "dip" ? "THEY DIPPED" : "AURA FARMED"}. ${amt}`;
  return `${result.how === "dip" ? "DIPPED" : "MOGGED"}. ${amt}`;
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
