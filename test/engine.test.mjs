// The rules, checked against hand-worked examples (expected values worked out by hand, not by the engine).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../public/engine/aura.js";

test("the deck is a standard 52 plus 2 jokers, ranks mapped to aura 1-5", () => {
  assert.equal(A.DECK.length, 54);
  assert.equal(new Set(A.DECK).size, 54);
  assert.equal(A.DECK.filter(A.isCap).length, 2);
  // per suit: 2,3,4 = 1; 5,6,7 = 2; 8,9,10 = 3; J,Q = 4; K,A = 5
  const perSuit = { 1: 3, 2: 3, 3: 3, 4: 2, 5: 2 };
  for (const s of "DHSC") for (const [v, k] of Object.entries(perSuit)) {
    assert.equal(A.DECK.filter((c) => c[1] === s && A.aura(c) === Number(v)).length, k, `${s} ${v}`);
  }
  assert.equal(A.aura("X1"), 0);
});

test("DRIP > RIZZ > MOG > YAP > DRIP; opposites and mirrors are neutral", () => {
  const yes = [["AD", "AH"], ["AH", "AS"], ["AS", "AC"], ["AC", "AD"]];
  const no = [["AD", "AS"], ["AS", "AD"], ["AH", "AC"], ["AC", "AH"], ["AD", "KD"], ["AH", "AD"], ["X1", "AD"], ["AD", "X1"]];
  for (const [a, b] of yes) assert.ok(A.beats(a, b), `${a} beats ${b}`);
  for (const [a, b] of no) assert.ok(!A.beats(a, b), `${a} does not beat ${b}`);
});

// Q♥ RIZZ 4 vs K♠ MOG 5: 8 vs 5. 9♣ YAP 3 vs 8♦ DRIP 3: 6 vs 3. CAP vs 7♥: 0 vs 2. Totals 14 vs 10.
const A1 = ["QH", "9C", "X1"], B1 = ["KS", "8D", "7H"];

test("totals double a card whose style beats the card it faces", () => {
  assert.deepEqual(A.totals(A1, B1), [14, 10]);
  assert.deepEqual(A.totals(A1, B1, 1), [8, 5]);
});

test("showdown: FARM doubles the pot once a round, winner holding a CAP gets NO CAP", () => {
  const s = A.play(A1, B1, [["lock", "farm"], ["farm", "farm"], ["lock", "lock"]]);
  assert.equal(s.over, true);
  assert.equal(s.pot, 40000);
  assert.equal(s.result.winner, 0);
  assert.deepEqual(s.result.deltas, [40000 + 500000, -40000]);
  assert.equal(A.caption(s.result, 0), "NO CAP. +540,000 aura");
  assert.equal(A.caption(s.result, 1), "MOGGED. -40,000 aura");
});

test("CRASHED OUT: farmed all 3 rounds, then lost to a CAP", () => {
  // K♠ 5 vs CAP: 5 vs 0. A♠ MOG 5 vs A♥ RIZZ 5: 5 vs 10. Q♠ MOG 4 vs K♥ RIZZ 5: 4 vs 10. 14 vs 20.
  const s = A.play(["KS", "AS", "QS"], ["X2", "AH", "KH"], [["farm", "lock"], ["farm", "lock"], ["farm", "lock"]]);
  assert.equal(s.pot, 80000);
  assert.deepEqual(s.result.deltas, [-80000 - 1000000, 80000 + 500000]);
  assert.equal(A.caption(s.result, 0), "CRASHED OUT. -1,080,000 aura");
});

test("a DIP pays the pot from before this round's FARM; the winner's best card never flipped", () => {
  const s = A.play(A1, B1, [["lock", "lock"], ["farm", "dip"]]);
  assert.equal(s.result.how, "dip");
  assert.equal(s.pot, 10000);
  // side 0 wins 10,000 + NO CAP (it holds X1); its best card (Q♥ 4) flipped in round 1, so no untouched bonus
  assert.deepEqual(s.result.deltas, [10000 + 500000, -10000]);
});

test("dipping holding the winning hand costs 100,000; winning untouched pays 100,000", () => {
  // side 0 = B1 (10), side 1 = A1 (14). Side 1 dips in round 1 though it would have won 14 vs 10: -100,000.
  // Side 0 wins with its best card (K♠ 5) never flipped: +100,000.
  const s = A.play(B1, A1, [["lock", "dip"]]);
  assert.deepEqual(s.result.deltas, [10000 + 100000, -10000 - 100000]);
});

test("both DIP, and an exact tie, change nothing", () => {
  assert.deepEqual(A.play(A1, B1, [["dip", "dip"]]).result.deltas, [0, 0]);
  // 5♦ 2 vs 6♦ 2, 2♠ 1 vs 3♠ 1, 9♥ 3 vs 8♥ 3: same styles, no doubling, 6 vs 6
  const t = A.play(["5D", "2S", "9H"], ["6D", "3S", "8H"], [["lock", "lock"], ["lock", "lock"], ["lock", "lock"]]);
  assert.equal(t.result.how, "tie");
  assert.deepEqual(t.result.deltas, [0, 0]);
  assert.equal(A.caption(t.result, 0), "MUTUAL MOG. +0 aura");
});

test("a deal is the same for the same seed, and gives two different 5-card hands", () => {
  const seed = "0123456789abcdef0123456789abcdef";
  const [h1, h2] = A.deal(seed);
  assert.deepEqual(A.deal(seed), [h1, h2]);
  assert.equal(new Set([...h1, ...h2]).size, 10);
  assert.notDeepEqual(A.deal("f".repeat(32)), [h1, h2]);
});

test("a lineup is 3 different slots of the hand", () => {
  const h = ["2D", "3D", "4D", "5D", "6D"];
  assert.deepEqual(A.lineupCards(h, [4, 0, 2]), ["6D", "2D", "4D"]);
  for (const bad of [[0, 0, 1], [0, 1], [0, 1, 5], [0, 1, 1.5], "012"]) assert.equal(A.lineupCards(h, bad), null);
});

test("standing aura: 1,000 a full hour, overlapping challenges count once", () => {
  assert.equal(A.standing([[0, 5400]]), 1000);
  assert.equal(A.standing([[0, 7200], [3600, 10800]]), 3000);
  assert.equal(A.standing([[0, 3600], [7200, 10800]]), 2000);
});
