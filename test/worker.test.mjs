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
      // like D1: every statement in the batch gets its rows (reads) or its change count (writes)
      const out = stmts.map((st) => /^\s*(SELECT|WITH)/i.test(st.sql) || /RETURNING/i.test(st.sql)
        ? { results: db.prepare(st.sql).all(...st.args), meta: { changes: 0 } }
        : { results: [], meta: { changes: db.prepare(st.sql).run(...st.args).changes } });
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

// Who wins a face-off, written out by hand (not the engine): DRIP beats RIZZ beats MOG beats DRIP, the CAP loses.
const BEAT = { D: "R", R: "M", M: "D" };
const judge = (a, b) => (a[0] === "X" ? 1 : b[0] === "X" ? 0 : BEAT[a[0]] === b[0] ? 0 : BEAT[b[0]] === a[0] ? 1 : null);

test("a whole duel: post 3 in order, peek with VIBES, take: decided at once and sealed on the ledger", async () => {
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

  // before taking, bo sees ann's 5 but not her 3; a peek shows the card she plays in one round
  const look = await call("bo", "GET", `/api/duel?id=${d.id}`);
  assert.equal(look.mine, undefined);
  assert.equal(look.lineups, undefined);
  assert.equal(look.vibes, 1);
  const p = await call("bo", "POST", "/api/vibes", { id: d.id, slot: 1 });
  assert.deepEqual(p.peeks, [{ slot: 1, card: d.hands[0][0] }], "round 2 is slot 0 of [2, 0, 4]");
  assert.equal(p.vibes, 0);
  assert.equal((await call("bo", "POST", "/api/vibes", { id: d.id, slot: 2 })).status, 400, "out of VIBES");
  assert.equal((await call("bo", "POST", "/api/vibes", { id: d.id, slot: 1 })).vibes, 0, "the same peek again is free");
  assert.equal((await call("ann", "POST", "/api/vibes", { id: d.id, slot: 0 })).status, 400, "not on your own challenge");

  const tk = await call("bo", "POST", "/api/take", { id: d.id, slots: [1, 3, 0] });
  assert.equal(tk.status, "done");
  const lines = [[2, 0, 4].map((i) => d.hands[0][i]), [1, 3, 0].map((i) => d.hands[1][i])];
  assert.deepEqual(tk.lineups, lines);
  assert.equal((await call("cy", "POST", "/api/take", { id: d.id, slots: [1, 3, 0] })).status, 400, "already taken");

  // the result, worked out by hand from the two lineups
  const won = [0, 0];
  for (let i = 0; i < 3; i++) { const w = judge(lines[0][i], lines[1][i]); if (w !== null) won[w]++; }
  assert.deepEqual(tk.result.won, won);
  const winner = won[0] === won[1] ? null : won[0] > won[1] ? 0 : 1;
  const bonus = winner === null ? 0 : (won[winner] === 3 ? 100000 : 0) + (lines[winner].includes("X1") ? 500000 : 0);
  const want = winner === null ? [0, 0] : winner === 0 ? [10000 + bonus, -10000] : [-10000, 10000 + bonus];
  assert.deepEqual(tk.result.deltas, want);
  // losing earns a VIBES: ann had none spent (1 + 1), bo had spent his (0 + 1)
  const v = [(await call("ann", "GET", "/api/today")).vibes, (await call("bo", "GET", "/api/today")).vibes];
  assert.deepEqual(v, winner === null ? [1, 0] : winner === 0 ? [1, 1] : [2, 0]);

  // the ledger: one entry, chained from GENESIS, both lineups revealed and matching their commitments
  const { entries } = await call("ann", "GET", "/api/ledger");
  assert.equal(entries.length, 1);
  const row = env.DB.raw.prepare("SELECT * FROM ledger").get();
  assert.equal(row.prev_hash, "0".repeat(64));
  assert.equal(row.hash, sha(row.prev_hash + "|" + row.record));
  const rec = JSON.parse(row.record);
  assert.equal(rec.rules, 3);
  assert.equal(rec.players.includes(null), false);
  assert.deepEqual(rec.lineups, lines);
  for (const s of [0, 1]) assert.equal(sha(rec.lineups[s].join(",") + "|" + rec.salts[s]), rec.commits[s]);
  assert.equal(JSON.stringify(rec).includes("ann"), false, "records hold ids, never names");

  const lb = await call("bo", "GET", "/api/leaderboard");
  assert.equal(lb.rows.length, 2);
});

test("at most 3 challenges on the board; the daily reset expires them", async () => {
  const { call, tick } = setup();
  for (let i = 0; i < 3; i++) {
    const d = await call("ann", "POST", "/api/draft");
    await call("ann", "POST", "/api/post", { id: d.id, slots: [0, 1, 2] });
  }
  assert.equal((await call("ann", "POST", "/api/draft")).status, 400);
  const open = (await call("bo", "GET", "/api/board")).challenges;
  await call("bo", "POST", "/api/take", { id: open[0].id, slots: [0, 1, 2] });
  tick(16 * 3600 + 1);     // past midnight UTC
  assert.equal((await call("bo", "GET", "/api/board")).challenges.length, 0);
  assert.equal((await call("ann", "GET", `/api/duel?id=${open[0].id}`)).status, "done");
  assert.equal((await call("ann", "GET", `/api/duel?id=${open[1].id}`)).status, "expired");
  assert.equal((await call("bo", "POST", "/api/take", { id: open[1].id, slots: [0, 1, 2] })).status, 400);
});

test("each finished duel sends the registry a checkpoint of the ledger: public facts, never a player", async () => {
  const { env, call } = setup();
  for (let i = 0; i < 2; i++) {
    const d = await call("ann", "POST", "/api/draft");
    await call("ann", "POST", "/api/post", { id: d.id, slots: [0, 1, 2] });
    await call("bo", "POST", "/api/take", { id: d.id, slots: [0, 1, 2] });
  }
  const rows = env.DB.raw.prepare("SELECT * FROM ledger ORDER BY id").all();
  const sent = env.REGISTRY.checkpoints;
  assert.deepEqual(sent.map((c) => [c.game, c.entries, c.head]), [["aura-farm", 1, rows[0].hash], ["aura-farm", 2, rows[1].hash]]);
  const r = JSON.parse(rows[1].record);
  assert.deepEqual(sent[1].detail, { day: "2027-01-01", duel: rows[1].duel_id, result: r.result, score: r.won,
    winner: r.winner === 0 ? "challenger" : r.winner === 1 ? "taker" : null, aura: r.deltas, bonuses: r.bonuses.map((b) => b[0]) });
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

test("names can't be typed: /api/name rerolls a new random two-word name", async () => {
  const { call } = setup();
  await call("ann", "POST", "/api/draft");
  const before = (await call("ann", "GET", "/api/today")).name;
  const r = await call("ann", "POST", "/api/name", { name: "Typed Name" });
  assert.notEqual(r.name, "Typed Name");
  assert.notEqual(r.name, before);
  assert.match(r.name, /^\S.{1,14}\S$/);
  assert.equal((await call("ann", "GET", "/api/today")).name, r.name);
});

test("a duel finished under older rules shows its cards and captions from its ledger record, with no hands", async () => {
  const { env, call } = setup();
  await call("ann", "POST", "/api/draft");                 // player 1
  const rec = { kind: "duel", day: "2027-01-01", duel: 1, players: [1, 2], flipped: [["QH"], ["KS"]], lineups: null, pot: 10000,
    caption: ["THEY DIPPED. +10,000 aura", "DIPPED. -10,000 aura"] };
  env.DB.raw.prepare("INSERT INTO players (id, token_hash, created_at, seen_at) VALUES (2, 'x', 1, 1)").run();
  env.DB.raw.prepare(`UPDATE duels SET status = 'done', t_id = 2, c_slots = '[0,1,2]', t_slots = '[0,1,2]',
    result = '{"winner":0,"how":"dip","deltas":[10000,-10000],"bonuses":[]}', c_delta = 10000, t_delta = -10000 WHERE id = 1`).run();
  env.DB.raw.prepare("INSERT INTO ledger (kind, day, duel_id, record, prev_hash, hash, created_at) VALUES ('duel', '2027-01-01', 1, ?, ?, ?, 1)")
    .run(JSON.stringify(rec), "0".repeat(64), "a".repeat(64));
  const v = await call("ann", "GET", "/api/duel?id=1");
  assert.equal(v.hands, null);
  assert.deepEqual(v.lineups, [["QH", null, null], ["KS", null, null]]);
  assert.deepEqual(v.mine, ["QH", null, null]);
  assert.equal(v.captions[0], "THEY DIPPED. +10,000 aura");
});
