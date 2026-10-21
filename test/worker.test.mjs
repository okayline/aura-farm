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

// A stand-in for the shared accounts (the Accounts entrypoint of dungeon-items, tested there), copied from
// scoundrel.exe's tests: same answers, kept in maps. A "passkey" is any credential { id } that was registered.
function fakeAccounts() {
  let n = 0; const codes = new Map(), keys = new Map(), links = new Map();
  const err = (error, status = 400) => ({ error, status });
  const own = (id) => [...codes].filter(([, v]) => v.acct === id);
  return {
    links,
    async createAccount() { return { accountId: ++n }; },
    async addCode(id) {
      const code = "CODE-" + (codes.size + 1) + "-" + id;
      codes.set(code, { acct: id, id: codes.size + 1 }); return { code };
    },
    async removeCode(id, cid) { const e = [...codes].find(([, v]) => v.acct === id && v.id === cid); if (!e) return err("No such save code.", 404); codes.delete(e[0]); return { ok: true }; },
    async loginCode({ code }) { const v = codes.get(code); return v ? { accountId: v.acct } : err("That save code didn't work. Check it and try again.", 404); },
    async info(id) { return { codes: own(id).map(([, v]) => ({ id: v.id, created_at: 1, last_used_at: null })), passkeys: [...keys].filter(([, v]) => v.acct === id).map(([, v]) => ({ id: v.id, label: v.label })), games: [] }; },
    async waysIn(id) { return own(id).length + [...keys].filter(([, v]) => v.acct === id).length; },
    async playerFor(id, g) { return { playerId: links.get(id + "|" + g) ?? null }; },
    async link(id, g, p) {
      if (links.has(id + "|" + g)) return { playerId: links.get(id + "|" + g), linked: links.get(id + "|" + g) === p };
      if ([...links].some(([k, v]) => k.endsWith("|" + g) && v === p)) return { playerId: null, linked: false, taken: true };
      links.set(id + "|" + g, p); return { playerId: p, linked: true };
    },
    async accountOf(g, p) { const e = [...links].find(([k, v]) => k.endsWith("|" + g) && v === p); return { accountId: e ? Number(e[0].split("|")[0]) : null }; },
    async passkeyRegisterOptions({ accountId, origin }) { return { challenge: "c-" + accountId, origin }; },
    async passkeyRegister({ accountId, credential, label }) { keys.set(credential.id, { acct: accountId, id: keys.size + 1, label }); return { ok: true }; },
    async passkeyLoginOptions({ origin }) { return { challenge: "login", origin }; },
    async passkeyLogin({ credential }) { const k = keys.get(credential?.id); return k ? { accountId: k.acct } : err("That passkey isn't saved here.", 400); },
    async passkeyRemove(id, kid) { const e = [...keys].find(([, v]) => v.acct === id && v.id === kid); if (!e) return err("No such passkey.", 404); keys.delete(e[0]); return { ok: true }; },
  };
}
// A stand-in for the registry's checkpoint call (the Registry entrypoint of dungeon-items, tested there).
function fakeRegistry() { const checkpoints = []; return { checkpoints, async checkpoint(a) { checkpoints.push(a); return { ok: true, created: true }; } }; }

const sha = (s) => createHash("sha256").update(s).digest("hex");
const T0 = Date.parse("2027-01-01T08:00:00Z") / 1000;

function setup() {
  let t = T0;
  setClock(() => t);
  const env = { DB: fakeD1(), ACCOUNTS: fakeAccounts(), REGISTRY: fakeRegistry(), DAILY_SECRET: "test-secret" };
  const jar = {};
  const call = async (who, method, path, body) => {
    const headers = { "content-type": "application/json" };
    if (jar[who]) headers.cookie = jar[who];
    const res = await worker.fetch(new Request("https://aura.test" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    const c = res.headers.get("set-cookie");
    if (c) jar[who] = /Max-Age=0/.test(c) ? null : c.split(";")[0];
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
  const p = await call("bo", "POST", "/api/vibes", { id: d.id, slot: 2 });
  assert.equal(p.reads[0].card, d.hands[0][2]);
  assert.equal(p.vibes, 0);
  assert.equal((await call("bo", "POST", "/api/vibes", { id: d.id, slot: 1 })).status, 400, "out of VIBES");
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

test("each finished duel sends the registry a checkpoint of the ledger: public facts, never a player", async () => {
  const { env, call } = setup();
  for (let i = 0; i < 2; i++) {
    const d = await call("ann", "POST", "/api/draft");
    await call("ann", "POST", "/api/post", { id: d.id, slots: [0, 1, 2] });
    await call("bo", "POST", "/api/take", { id: d.id, slots: [0, 1, 2] });
    await call("ann", "POST", "/api/move", { id: d.id, round: 1, move: "lock" });
    await call("bo", "POST", "/api/move", { id: d.id, round: 1, move: "dip" });
  }
  const rows = env.DB.raw.prepare("SELECT * FROM ledger ORDER BY id").all();
  const sent = env.REGISTRY.checkpoints;
  assert.deepEqual(sent.map((c) => [c.game, c.entries, c.head]), [["aura-farm", 1, rows[0].hash], ["aura-farm", 2, rows[1].hash]]);
  assert.deepEqual(sent[1].detail, { day: "2027-01-01", duel: rows[1].duel_id, result: "dip", rounds: 1, pot: 10000,
    winner: "challenger", aura: JSON.parse(rows[1].record).deltas, bonuses: JSON.parse(rows[1].record).bonuses.map((b) => b[0]) });
  assert.equal(JSON.stringify(sent).includes("players"), false);
  assert.equal(JSON.stringify(sent).includes("ann"), false);
});

test("save codes and passkeys: load your player on another device, log out only with a way back in", async () => {
  const { env, call } = setup();
  const d = await call("ann", "POST", "/api/draft");
  assert.equal((await call("ann", "POST", "/api/logout")).status, 400, "no code or passkey yet");
  const { code } = await call("ann", "POST", "/api/codes", { action: "new" });
  assert.equal((await call("phone", "POST", "/api/load", { code: "WRONG" })).status, 404);
  assert.equal((await call("phone", "POST", "/api/load", { code })).status, 200);
  assert.equal((await call("phone", "GET", `/api/duel?id=${d.id}`)).side, 0, "the phone is ann now");
  assert.equal((await call("phone", "GET", "/api/account")).devices, 2);
  await call("phone", "POST", "/api/passkey", { action: "register", label: "phone", credential: { id: "key1" } });
  assert.equal((await call("ann", "GET", "/api/account")).passkeys.length, 1);
  assert.equal((await call("ann", "POST", "/api/logout")).status, 200);
  assert.equal((await call("ann", "GET", `/api/duel?id=${d.id}`)).status, 404, "logged out: the draft is hidden again");
  assert.equal((await call("ann", "POST", "/api/passkey", { action: "login", credential: { id: "key1" } })).status, 200);
  assert.equal((await call("ann", "GET", `/api/duel?id=${d.id}`)).side, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM players").get().n, 1, "logging in never made a second player");
});

test("an ordinary click writes nothing: 'seen' times are saved at most every 15 minutes", async () => {
  const { env, call, tick } = setup();
  await call("ann", "POST", "/api/draft");
  const seen = () => env.DB.raw.prepare("SELECT seen_at FROM players").get().seen_at;
  const first = seen();
  tick(600); await call("ann", "GET", "/api/today");
  assert.equal(seen(), first);
  tick(300); await call("ann", "GET", "/api/today");
  assert.equal(seen(), first + 900);
});

test("the version on the page matches the newest CHANGELOG heading", async () => {
  const { VERSION } = await import("../public/engine/version.js");
  const log = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  assert.equal(/^## v(\S+)/m.exec(log)[1], VERSION);
});
