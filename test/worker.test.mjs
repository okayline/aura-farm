// End-to-end tests of the Worker API, with Node's built-in SQLite standing in for D1.
// Hashes and commitments are recomputed with node:crypto, not the code under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import worker, { setClock } from "../src/worker.js";

// a tiny D1 lookalike (copied from scoundrel.exe test/worker.test.mjs)
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const prep = (sql, args = []) => ({
    sql, args,
    bind: (...a) => prep(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  const batch = async (stmts) => {
    db.exec("BEGIN");
    try {
      const out = stmts.map((st) => ({ meta: { changes: db.prepare(st.sql).run(...st.args).changes } }));
      db.exec("COMMIT");
      return out;
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  return { prepare: (sql) => prep(sql), batch, raw: db };
}

const sha = (s) => createHash("sha256").update(s).digest("hex");
const T0 = Date.parse("2027-01-01T08:00:00Z") / 1000;

function setup() {
  let t = T0;
  setClock(() => t);
  const env = { DB: fakeD1(), DAILY_SECRET: "test-secret" };
  const jar = {};
  const call = async (who, method, path, body) => {
    const headers = { "content-type": "application/json" };
    if (jar[who]) headers.cookie = jar[who];
    const res = await worker.fetch(new Request("https://aura.test" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    const c = res.headers.get("set-cookie");
    if (c) jar[who] = c.split(";")[0];
    return { status: res.status, ...(await res.json()) };
  };
  return { env, call, tick: (s) => { t += s; } };
}

test("a whole duel: post, take, secret picks, showdown, sealed on the ledger", async () => {
  const { env, call, tick } = setup();
  const d = await call("ann", "POST", "/api/draft");
  assert.equal(d.status, "draft");
  assert.equal(d.hands[0].length, 5);
  assert.equal((await call("ann", "POST", "/api/draft")).id, d.id, "an unposted draft comes back, not a new deal");
  assert.equal((await call("ann", "POST", "/api/post", { id: d.id, slots: [0, 0, 1] })).status, 400);
  await call("ann", "POST", "/api/post", { id: d.id, slots: [2, 0, 4] });

  tick(2 * 3600 + 60);     // stood for 2 hours
  const b = await call("bo", "GET", "/api/board");
  assert.equal(b.challenges.length, 1);
  assert.equal(b.challenges[0].aura, 2000);
  assert.equal(b.challenges[0].hands, undefined, "the board never shows cards");

  const tk = await call("bo", "POST", "/api/take", { id: d.id, slots: [1, 3, 0] });
  assert.equal(tk.status, "live");
  assert.deepEqual(tk.mine, [1, 3, 0].map((i) => tk.hands[1][i]));
  assert.equal((await call("bo", "POST", "/api/take", { id: d.id, slots: [1, 3, 0] })).status, 400);

  // round 1: ann's pick stays secret until bo picks
  const m1 = await call("ann", "POST", "/api/move", { id: d.id, round: 1, move: "farm" });
  assert.equal(m1.myMove, "farm");
  const seen = await call("bo", "GET", `/api/duel?id=${d.id}`);
  assert.equal(seen.theyMoved, true);
  assert.equal(seen.myMove, null);
  assert.equal(JSON.stringify(seen).includes('"farm"'), false, "bo can't see ann's pick");
  assert.equal((await call("ann", "POST", "/api/move", { id: d.id, round: 1, move: "lock" })).status, 400);
  await call("bo", "POST", "/api/move", { id: d.id, round: 1, move: "lock" });
  for (const r of [2, 3]) {
    await call("ann", "POST", "/api/move", { id: d.id, round: r, move: "lock" });
    await call("bo", "POST", "/api/move", { id: d.id, round: r, move: "lock" });
  }
  const end = await call("ann", "GET", `/api/duel?id=${d.id}`);
  assert.equal(end.status, "done");
  assert.equal(end.pot, 20000);
  assert.equal(end.result.deltas[0] + end.result.deltas[1] - end.result.bonuses.reduce((s, x) => s + x[1], 0), 0);

  // the ledger: one entry, chained from GENESIS, its revealed lineups match their commitments
  const { entries } = await call("ann", "GET", "/api/ledger");
  assert.equal(entries.length, 1);
  const row = env.DB.raw.prepare("SELECT * FROM ledger").get();
  assert.equal(row.prev_hash, "0".repeat(64));
  assert.equal(row.hash, sha(row.prev_hash + "|" + row.record));
  const rec = JSON.parse(row.record);
  assert.equal(rec.players.includes(null), false);
  for (const s of [0, 1]) assert.equal(sha(rec.lineups[s].join(",") + "|" + rec.salts[s]), rec.commits[s]);
  assert.equal(JSON.stringify(rec).includes("ann"), false, "records hold ids, never names");

  const lb = await call("bo", "GET", "/api/leaderboard");
  assert.equal(lb.rows.length, 2);
});

test("a DIP ends it, keeps unflipped cards off the ledger and earns VIBES; reads cost VIBES", async () => {
  const { env, call } = setup();
  const d = await call("ann", "POST", "/api/draft");
  await call("ann", "POST", "/api/post", { id: d.id, slots: [0, 1, 2] });
  await call("bo", "POST", "/api/take", { id: d.id, slots: [0, 1, 2] });
  const p = await call("bo", "POST", "/api/vibes", { id: d.id, kind: "peek", slot: 2 });
  assert.equal(p.reads[0].card, d.hands[0][2]);
  assert.equal(p.vibes, 0);
  assert.equal((await call("bo", "POST", "/api/vibes", { id: d.id, kind: "ask" })).status, 400, "out of VIBES");
  await call("ann", "POST", "/api/move", { id: d.id, round: 1, move: "lock" });
  await call("bo", "POST", "/api/move", { id: d.id, round: 1, move: "dip" });
  const end = await call("bo", "GET", `/api/duel?id=${d.id}`);
  assert.equal(end.result.how, "dip");
  assert.equal(end.result.winner, 0);
  const rec = JSON.parse(env.DB.raw.prepare("SELECT record FROM ledger").get().record);
  assert.equal(rec.lineups, null);
  assert.equal(rec.salts, null);
  assert.deepEqual(rec.flipped, [[], []]);
  assert.equal((await call("bo", "GET", "/api/today")).vibes, 1, "spent 1, earned 1 by dipping");
});

test("at most 3 challenges on the board; the daily reset expires them and DIPs missing picks", async () => {
  const { call, tick } = setup();
  for (let i = 0; i < 3; i++) {
    const d = await call("ann", "POST", "/api/draft");
    await call("ann", "POST", "/api/post", { id: d.id, slots: [0, 1, 2] });
  }
  assert.equal((await call("ann", "POST", "/api/draft")).status, 400);
  const open = (await call("bo", "GET", "/api/board")).challenges;
  await call("bo", "POST", "/api/take", { id: open[0].id, slots: [0, 1, 2] });
  await call("bo", "POST", "/api/move", { id: open[0].id, round: 1, move: "farm" });
  tick(16 * 3600 + 1);     // past midnight UTC
  const next = await call("bo", "GET", "/api/board");
  assert.equal(next.challenges.length, 0);
  const d = await call("ann", "GET", `/api/duel?id=${open[0].id}`);
  assert.equal(d.status, "done");
  assert.equal(d.result.winner, 1, "ann never picked: counted as a DIP");
  const left = await call("ann", "GET", `/api/duel?id=${open[1].id}`);
  assert.equal(left.status, "expired");
});
