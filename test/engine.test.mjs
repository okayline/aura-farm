// The rules, checked against hand-worked examples (expected values worked out by hand, not by the engine).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../public/engine/aura.js";

test("the deck is 20 cards: 6 each of DRIP, RIZZ and MOG, and 2 CAPs", () => {
  assert.equal(A.DECK.length, 20);
  assert.equal(new Set(A.DECK).size, 20);
  for (const st of "DRM") assert.equal(A.DECK.filter((c) => A.style(c) === st).length, 6, st);
  assert.equal(A.DECK.filter(A.isCap).length, 2);
});

test("DRIP > RIZZ > MOG > DRIP; same style draws; a CAP loses to any style; two CAPs draw", () => {
  assert.equal(A.faceOff("D1", "R1"), 0);
  assert.equal(A.faceOff("R1", "M1"), 0);
  assert.equal(A.faceOff("M1", "D1"), 0);
  assert.equal(A.faceOff("R1", "D1"), 1);
  assert.equal(A.faceOff("D1", "D2"), null);
  assert.equal(A.faceOff("X1", "M1"), 1);
  assert.equal(A.faceOff("M1", "X1"), 0);
  assert.equal(A.faceOff("X1", "X2"), null);
});

// RIZZ vs MOG: a. MOG vs DRIP: a. CAP vs RIZZ: b. Rounds won 2 vs 1.
const A1 = ["R1", "M1", "X1"], B1 = ["M2", "D1", "R2"];

test("totals count rounds won", () => {
  assert.deepEqual(A.totals(A1, B1), [2, 1]);
  assert.deepEqual(A.totals(A1, B1, 1), [1, 0]);
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
  // DRIP vs CAP: a. DRIP vs MOG: b. MOG vs RIZZ: b. b wins 2-1 holding a CAP.
  const s = A.play(["D1", "D2", "M1"], ["X1", "M2", "R1"], [["farm", "lock"], ["farm", "lock"], ["farm", "lock"]]);
  assert.equal(s.pot, 80000);
  assert.deepEqual(s.result.deltas, [-80000 - 1000000, 80000 + 500000]);
  assert.equal(A.caption(s.result, 0), "CRASHED OUT. -1,080,000 aura");
});

test("a DIP pays the pot from before this round's FARM", () => {
  const s = A.play(A1, B1, [["lock", "lock"], ["farm", "dip"]]);
  assert.equal(s.result.how, "dip");
  assert.equal(s.pot, 10000);
  // side 0 wins 10,000 + NO CAP (it holds X1); side 1 would have lost anyway, so no penalty
  assert.deepEqual(s.result.deltas, [10000 + 500000, -10000]);
});

test("dipping holding the winning hand costs 100,000", () => {
  // side 0 = B1, side 1 = A1. Side 1 dips in round 1 though it would have won 2-1.
  const s = A.play(B1, A1, [["lock", "dip"]]);
  assert.deepEqual(s.result.deltas, [10000, -10000 - 100000]);
});

test("both DIP, and equal rounds won, change nothing", () => {
  assert.deepEqual(A.play(A1, B1, [["dip", "dip"]]).result.deltas, [0, 0]);
  const L = [["lock", "lock"], ["lock", "lock"], ["lock", "lock"]];
  // three same-style draws
  const t = A.play(["D1", "R1", "M1"], ["D2", "R2", "M2"], L);
  assert.equal(t.result.how, "tie");
  assert.deepEqual(t.result.deltas, [0, 0]);
  assert.equal(A.caption(t.result, 0), "MUTUAL MOG. +0 aura");
  // DRIP vs RIZZ: a. MOG vs RIZZ: b. RIZZ vs RIZZ: draw. 1-1.
  assert.equal(A.play(["D1", "M1", "R1"], ["R2", "R3", "R4"], L).result.how, "tie");
});

test("a deal is the same for the same seed, and gives two different 5-card hands", () => {
  const seed = "0123456789abcdef0123456789abcdef";
  const [h1, h2] = A.deal(seed);
  assert.deepEqual(A.deal(seed), [h1, h2]);
  assert.equal(new Set([...h1, ...h2]).size, 10);
  assert.notDeepEqual(A.deal("f".repeat(32)), [h1, h2]);
});

test("a lineup is 3 different slots of the hand", () => {
  const h = ["D1", "D2", "R1", "M1", "X1"];
  assert.deepEqual(A.lineupCards(h, [4, 0, 2]), ["X1", "D1", "R1"]);
  for (const bad of [[0, 0, 1], [0, 1], [0, 1, 5], [0, 1, 1.5], "012"]) assert.equal(A.lineupCards(h, bad), null);
});

test("standing aura: 1,000 a full hour, overlapping challenges count once", () => {
  assert.equal(A.standing([[0, 5400]]), 1000);
  assert.equal(A.standing([[0, 7200], [3600, 10800]]), 3000);
  assert.equal(A.standing([[0, 3600], [7200, 10800]]), 2000);
});
