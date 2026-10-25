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
  assert.equal(A.caption(r, 0), "COOKED. -100,000 AURA");
  assert.equal(A.caption(r, 1), "AURA FARMED. +100,000 AURA");
  const s = A.farm("D", "R");     // DRIP beats RIZZ: the poster wins
  assert.equal(A.caption(s, 0), "AURA FARMED. +100,000 AURA");
  assert.equal(A.caption(s, 1), "COOKED. -100,000 AURA");
  assert.equal(A.caption(A.farm("M", "M"), 1), "MUTUAL MOG. +0 AURA");
});

test("the line: picked by the farm's number from the winning matchup's four; a draw names its style", () => {
  assert.equal(A.line(["R", "M"], 0), "MOG couldn't handle the RIZZ.");        // RIZZ beats MOG, line 1 of 8
  assert.equal(A.line(["M", "R"], 11), "MOG blushed. gg, out-RIZZed.");        // same matchup either way round, 11 % 8 = 3
  assert.equal(A.line(["D", "M"], 9), "All that DRIP, still got MOGGED.");     // MOG beats DRIP, 9 % 8 = 1
  assert.equal(A.line(["R", "D"], 15), "RIZZ got iced out.");                  // DRIP beats RIZZ, 15 % 3 = 0
  assert.equal(A.line(["M", "M"], 2), "Two MOGS. One Love.");
  assert.equal(A.line(["R", "R"], 3), "A RIZZY standoff.");
  assert.equal(A.line(["D", "D"], 7), "DRIP recognizes DRIP.");
  for (const list of Object.values(A.LINES)) for (const l of list) assert.match(l.replace(/\{.\}/g, "MOGGY"), /^[A-Za-z0-9 .,'-]{1,40}$/, "the registry takes it");
});

test("a record is a player's latest 10 styles, newest first", () => {
  // ids 1-12 with styles D R M D R M D R M D R M: the latest 10 are ids 12 down to 3
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, style: "DRM"[i % 3] }));
  assert.deepEqual(A.record([...rows].reverse()), ["M", "R", "D", "M", "R", "D", "M", "R", "D", "M"]);
  assert.deepEqual(A.record([{ id: 3, style: "M" }, { id: 9, style: "D" }]), ["D", "M"]);
});

test("a farm moves 100,000 plus 10,000 for each whole hour it stood", () => {
  assert.deepEqual(A.farm("D", "R", 1), { winner: 0, how: "win", deltas: [110000, -110000] });
  assert.deepEqual(A.farm("D", "M", 12), { winner: 1, how: "win", deltas: [-220000, 220000] });
  assert.deepEqual(A.farm("R", "D", 23), { winner: 1, how: "win", deltas: [-330000, 330000] });
  assert.deepEqual(A.farm("M", "M", 12), { winner: null, how: "tie", deltas: [0, 0] });
  assert.equal(A.caption(A.farm("D", "R", 12), 0), "AURA FARMED. +220,000 AURA");
  assert.throws(() => A.farm("D", "R", 1.5));
  assert.throws(() => A.farm("D", "R", -1));
});

test("a farm earns a flat 10,000 for each whole hour", () => {
  assert.equal(A.earned(0), 0);
  assert.equal(A.earned(1), 10000);
  assert.equal(A.earned(2), 20000);
  assert.equal(A.earned(3), 30000);
  assert.equal(A.earned(12), 120000);
  assert.equal(A.earned(24), 240000);
});

test("standing aura: by the farm's age, the oldest farm up earns, a partial hour waits", () => {
  assert.equal(A.standing([[0, 5400, 0]]), 10000);                          // 1.5 hours: one whole hour
  assert.equal(A.standing([[0, 7200, 0]]), 20000);
  assert.equal(A.standing([[0, 3600, 0], [7200, 10800, 7200]]), 20000);     // two farms an hour apart, 10,000 each
  assert.equal(A.standing([[0, 7200, 0], [3600, 10800, 3600]]), 30000);     // the younger one carries on from its own age: 20,000 then its 2nd hour, 10,000
  assert.equal(A.standing([[0, 7200, 0], [1800, 3600, 1800]]), 20000);      // a younger farm inside an older one adds nothing
  assert.equal(A.standing([[3600, 7200, 0]]), 10000);                       // the 2nd hour of a farm put up at 0, counted from 3600
});


test("flexState: each farm up is one FLEX per 30 minutes; none ready says how long until the next", () => {
  assert.deepEqual(A.flexState(0, [], 1000), { ready: 0, wait: 0 });             // no farm up: none, and nothing to wait for
  assert.deepEqual(A.flexState(1, [], 1000), { ready: 1, wait: 0 });
  assert.deepEqual(A.flexState(1, [900], 1000), { ready: 0, wait: 1700 });        // FLEXed at 900: back at 900 + 1800 = 2700, 1700 s from now
  assert.deepEqual(A.flexState(3, [100, 200], 1000), { ready: 1, wait: 0 });      // 3 farms up, 2 FLEXes in the last 30 minutes
  assert.deepEqual(A.flexState(3, [950, 800, 900], 1000), { ready: 0, wait: 1600 });   // the oldest (800) comes back first: 800 + 1800 - 1000
  assert.deepEqual(A.flexState(1, [-900], 1000), { ready: 1, wait: 0 });          // -900 is over 30 minutes ago (before -800)
});
