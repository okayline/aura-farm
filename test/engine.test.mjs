// The rules, checked against hand-worked examples (expected values worked out by hand, not by the engine).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../public/engine/aura.js";

test("DRIP beats RIZZ, RIZZ beats MOG, MOG beats DRIP: the winner gets 100,000, the loser loses it", () => {
  assert.deepEqual(A.farm("D", "R"), { winner: 0, how: "win", deltas: [100000, -100000] });
  assert.deepEqual(A.farm("R", "M"), { winner: 0, how: "win", deltas: [100000, -100000] });
  assert.deepEqual(A.farm("M", "D"), { winner: 0, how: "win", deltas: [100000, -100000] });
  assert.deepEqual(A.farm("R", "D"), { winner: 1, how: "win", deltas: [-100000, 100000] });
  assert.deepEqual(A.farm("D", "M"), { winner: 1, how: "win", deltas: [-100000, 100000] });
  assert.deepEqual(A.farm("M", "R"), { winner: 1, how: "win", deltas: [-100000, 100000] });
});

test("the same style is a MUTUAL MOG: nothing changes", () => {
  for (const s of "DRM") assert.deepEqual(A.farm(s, s), { winner: null, how: "tie", deltas: [0, 0] });
  assert.throws(() => A.farm("X", "D"));
});

test("captions: a win is AURA FARMED, a loss is COOKED, a draw is MUTUAL MOG", () => {
  const r = A.farm("D", "M");     // MOG beats DRIP: the taker wins
  assert.equal(A.caption(r, 0), "COOKED. -100,000 aura");
  assert.equal(A.caption(r, 1), "AURA FARMED. +100,000 aura");
  const s = A.farm("D", "R");     // DRIP beats RIZZ: the poster wins
  assert.equal(A.caption(s, 0), "AURA FARMED. +100,000 aura");
  assert.equal(A.caption(s, 1), "COOKED. -100,000 aura");
  assert.equal(A.caption(A.farm("M", "M"), 1), "MUTUAL MOG. +0 aura");
});

test("a record is a player's latest 10 styles, newest first", () => {
  // ids 1-12 with styles D R M D R M D R M D R M: the latest 10 are ids 12 down to 3
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, style: "DRM"[i % 3] }));
  assert.deepEqual(A.record([...rows].reverse()), ["M", "R", "D", "M", "R", "D", "M", "R", "D", "M"]);
  assert.deepEqual(A.record([{ id: 3, style: "M" }, { id: 9, style: "D" }]), ["D", "M"]);
});

test("standing aura: 10,000 a full hour, overlapping farms count once", () => {
  assert.equal(A.standing([[0, 5400]]), 10000);
  assert.equal(A.standing([[0, 7200], [3600, 10800]]), 30000);
  assert.equal(A.standing([[0, 3600], [7200, 10800]]), 20000);
});
