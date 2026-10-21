// AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027. The rules, shared by the Worker and the page.
// Pure functions only: no network, no storage. Every number here is from the design doc.
//
// The deck is a standard 54: suits are styles, ranks are aura, the two jokers are CAPs.
// A duel: each side keeps 3 of its 5 cards in an order. Each round both pick LOCK IN, FARM or DIP in secret,
// then the round's cards flip. After round 3, the higher total wins the pot.

export const STYLE = { D: "DRIP", H: "RIZZ", S: "MOG", C: "YAP" };
export const SUIT = { D: "♦", H: "♥", S: "♠", C: "♣" };
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const RANK_AURA = { 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 3, 9: 3, T: 3, J: 4, Q: 4, K: 5, A: 5 };

// DRIP > RIZZ > MOG > YAP > DRIP. Opposites (DRIP/MOG, RIZZ/YAP) and same-style are neutral.
export const BEATS = { D: "H", H: "S", S: "C", C: "D" };

export const MOVES = ["lock", "farm", "dip"];
export const START_POT = 10000;
export const ROUNDS = 3;
export const BONUS = { noCap: 500000, untouched: 100000, dippedWinner: -100000, crashedOut: -1000000 };
export const STAND_PER_HOUR = 1000;
export const MAX_OPEN = 3;
export const VIBES_START = 1, VIBES_MAX = 3;

// Card codes: "QH" (queen of hearts), "TD" (ten of diamonds), "X1"/"X2" (the jokers, CAPs).
export const DECK = [...Object.keys(STYLE).flatMap((s) => RANKS.map((r) => r + s)), "X1", "X2"];

export const isCap = (c) => c[0] === "X";
export const aura = (c) => (isCap(c) ? 0 : RANK_AURA[c[0]]);
export const style = (c) => (isCap(c) ? null : c[1]);
export const beats = (a, b) => !isCap(a) && !isCap(b) && BEATS[style(a)] === style(b);
export const label = (c) => (isCap(c) ? "🃏 CAP 0" : `${c[0] === "T" ? "10" : c[0]}${SUIT[c[1]]} ${STYLE[c[1]]} ${aura(c)}`);

// A card's worth against the card it faces: double when its style beats theirs.
export const worth = (a, b) => aura(a) * (beats(a, b) ? 2 : 1);

// Totals after the first n flips of two lineups (arrays of card codes).
export function totals(a, b, n = ROUNDS) {
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += worth(a[i], b[i]); y += worth(b[i], a[i]); }
  return [x, y];
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

// A duel's deal from its seed: shuffle the 54, the challenger gets the first 5, the taker the next 5.
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
      // won without ever flipping your best card
      const best = Math.max(...hands[winner].map(aura));
      if (!hands[winner].slice(0, flipped).some((c) => aura(c) === best)) add("untouched", winner);
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
  if (mine.includes("untouched")) return `NEVER EVEN TRIED. ${amt}`;
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
