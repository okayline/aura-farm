// The rules, checked against hand-worked examples (expected values worked out by hand, not by the engine).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../public/engine/aura.js";

test("the deck is 19 cards: 6 each of DRIP, RIZZ and MOG, and 1 CAP", () => {
  assert.equal(A.DECK.length, 19);
  assert.equal(new Set(A.DECK).size, 19);
  for (const st of "DRM") assert.equal(A.DECK.filter((c) => A.style(c) === st).length, 6, st);
  assert.deepEqual(A.DECK.filter(A.isCap), ["X1"]);
});

test("DRIP > RIZZ > MOG > DRIP; same style draws; the CAP loses to any style", () => {
  assert.equal(A.faceOff("D1", "R1"), 0);
  assert.equal(A.faceOff("R1", "M1"), 0);
  assert.equal(A.faceOff("M1", "D1"), 0);
  assert.equal(A.faceOff("R1", "D1"), 1);
  assert.equal(A.faceOff("D1", "D2"), null);
  assert.equal(A.faceOff("X1", "M1"), 1);
  assert.equal(A.faceOff("M1", "X1"), 0);
});

test("win 2-1 holding the CAP: +10,000 and NO CAP +500,000; the loser loses 10,000", () => {
  // RIZZ vs MOG: a. MOG vs DRIP: a. CAP vs RIZZ: b.
  const r = A.duel(["R1", "M1", "X1"], ["M2", "D1", "R2"]);
  assert.deepEqual(r.won, [2, 1]);
  assert.equal(r.winner, 0);
  assert.deepEqual(r.deltas, [510000, -10000]);
  assert.equal(A.caption(r, 0), "NO CAP. +510,000 aura");
  assert.equal(A.caption(r, 1), "MOGGED. -10,000 aura");
});

test("TOTAL MOG: winning all 3 face-offs adds 100,000; 2 wins and a draw doesn't", () => {
  // DRIP vs RIZZ, RIZZ vs MOG, MOG vs DRIP: a, a, a.
  const r = A.duel(["D1", "R1", "M1"], ["R2", "M2", "D2"]);
  assert.deepEqual(r.deltas, [110000, -10000]);
  assert.equal(A.caption(r, 0), "TOTAL MOG. +110,000 aura");
  // RIZZ vs DRIP: b. DRIP vs MOG: b. MOG vs MOG: draw. The taker wins 2-0.
  const s = A.duel(["R1", "D1", "M1"], ["D2", "M2", "M3"]);
  assert.deepEqual(s.won, [0, 2]);
  assert.deepEqual(s.deltas, [-10000, 10000]);
  assert.equal(A.caption(s, 1), "AURA FARMED. +10,000 aura");
});

test("equal face-offs won is a MUTUAL MOG: nothing changes", () => {
  const t = A.duel(["D1", "R1", "M1"], ["D2", "R2", "M2"]);   // three draws
  assert.equal(t.winner, null);
  assert.deepEqual(t.deltas, [0, 0]);
  assert.equal(A.caption(t, 1), "MUTUAL MOG. +0 aura");
  // DRIP vs RIZZ: a. MOG vs RIZZ: b. RIZZ vs RIZZ: draw. 1-1.
  assert.equal(A.duel(["D1", "M1", "R1"], ["R2", "R3", "R4"]).how, "tie");
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
