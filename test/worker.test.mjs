// End-to-end tests of the Worker API, with Node's built-in SQLite standing in for D1.
// Hashes and commitments are recomputed with node:crypto, not the code under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
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
  const env = { DB: fakeD1(), ACCOUNTS: fakeAccounts(), REGISTRY: fakeRegistry() };
  const jar = {};
  const call = async (who, method, path, body) => {
    const headers = { "content-type": "application/json" };
    const mine = (jar[who] ||= {});
    if (Object.keys(mine).length) headers.cookie = Object.entries(mine).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await worker.fetch(new Request("https://aura.test" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    for (const c of res.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (/Max-Age=0/.test(c)) delete mine[k]; else mine[k] = v;
    }
    return { status: res.status, ...(await res.json()) };
  };
  return { env, call, tick: (s) => { t += s; } };
}

// Who wins, written out by hand (not the engine): DRIP beats RIZZ beats MOG beats DRIP.
const BEAT = { D: "R", R: "M", M: "D" };
const judge = (a, b) => (BEAT[a] === b ? 0 : BEAT[b] === a ? 1 : null);

test("a whole farm: post a sealed style, take: decided at once and sealed on the ledger", async () => {
  const { env, call, tick } = setup();
  assert.equal((await call("ann", "POST", "/api/farm", { style: "X" })).status, 400);
  const f = await call("ann", "POST", "/api/farm", { style: "R" });
  assert.equal(f.status, "open");
  assert.equal(f.mine, "R", "the poster sees their own sealed style");
  assert.equal((await call("ann", "GET", "/api/today")).farms[0].style, "R", "and on their own Farming row");
  assert.equal(f.left, 24 * 3600, "a new farm has its whole 24 hours left (seconds)");
  assert.equal(typeof f.postedAt, "number");

  tick(2 * 3600 + 60);     // stood for 2 hours
  assert.equal((await call("ann", "GET", "/api/today")).farms[0].left, 24 * 3600 - (2 * 3600 + 60), "the Farming row counts down");
  assert.equal((await call("ann", "GET", `/api/farm?id=${f.id}`)).left, 24 * 3600 - (2 * 3600 + 60), "and so does the farm's own page");
  const b = await call("bo", "GET", "/api/board");
  assert.equal(b.farms.length, 1);
  assert.equal(b.farms[0].aura, 20000);
  assert.deepEqual(b.farms[0].record, []);
  assert.equal(JSON.stringify(b).includes('"R"'), false, "the board never shows the style");

  // before taking, bo can't see ann's style
  const look = await call("bo", "GET", `/api/farm?id=${f.id}`);
  assert.equal(look.mine, undefined);
  assert.equal(look.styles, undefined);
  assert.equal((await call("bo", "POST", "/api/vibes", { id: f.id })).status, 404, "no VIBES any more");
  assert.equal((await call("ann", "POST", "/api/take", { id: f.id, style: "D" })).status, 400, "not your own farm");
  assert.equal((await call("bo", "POST", "/api/take", { id: f.id, style: "?" })).status, 400);

  const tk = await call("bo", "POST", "/api/take", { id: f.id, style: "D" });   // DRIP beats RIZZ: bo wins
  assert.equal(tk.status, "done");
  assert.deepEqual(tk.styles, ["R", "D"]);
  assert.equal(judge("R", "D"), 1);
  assert.deepEqual(tk.result.deltas, [-100000, 100000]);
  assert.equal(tk.result.winner, 1);
  assert.deepEqual(tk.captions, ["COOKED. -100,000 aura", "AURA FARMED. +100,000 aura"]);
  assert.equal(f.id, 1);
  assert.equal(tk.line, "Too much DRIP. RIZZ slipped.");
  assert.equal(tk.takenAt - tk.postedAt, 2 * 3600 + 60, "the farm's own page knows when it was put up and taken: it stood for the 2 hours and a minute above");
  assert.equal(tk.left, null, "a finished farm has no time left");
  const raw = env.DB.raw.prepare("SELECT id, record, prev_hash, hash FROM ledger WHERE farm_id = 1").get();
  assert.deepEqual(tk.ledger, { entry: raw.id, record: raw.record, prev: raw.prev_hash, hash: raw.hash }, "the farm shows its whole ledger entry");
  assert.equal(sha(tk.ledger.prev + "|" + tk.ledger.record), tk.ledger.hash, "and anyone can check its hash from what it shows");   // DRIP beat RIZZ on farm 1: that matchup's line 1 % 8 = 1 (counting from 0)
  assert.equal((await call("cy", "POST", "/api/take", { id: f.id, style: "M" })).status, 400, "already taken");

  // the record is public once revealed: both players' styles, newest first, on the next farm of either
  const g = await call("ann", "POST", "/api/farm", { style: "M" });
  const b2 = await call("cy", "GET", "/api/board");
  assert.deepEqual(b2.farms.find((x) => x.id === g.id).record, ["R"], "ann's record is the RIZZ she lost with");
  assert.deepEqual((await call("cy", "GET", `/api/farm?id=${f.id}`)).records, [["R"], ["D"]]);

  // the ledger: one entry, chained from GENESIS, both styles revealed and matching their commitments
  const { entries } = await call("ann", "GET", "/api/ledger");
  assert.equal(entries.length, 1);
  const row = env.DB.raw.prepare("SELECT * FROM ledger").get();
  assert.equal(row.prev_hash, "0".repeat(64));
  assert.equal(row.hash, sha(row.prev_hash + "|" + row.record));
  assert.equal(row.farm_id, f.id);
  const rec = JSON.parse(row.record);
  assert.equal(rec.rules, 4);
  assert.deepEqual(rec.styles, ["R", "D"]);
  assert.equal(rec.players.includes(null), false);
  assert.equal(rec.line, "Too much DRIP. RIZZ slipped.", "the line is sealed with the farm");
  for (const sd of [0, 1]) assert.equal(sha(rec.styles[sd] + "|" + rec.salts[sd]), rec.commits[sd]);
  assert.equal(JSON.stringify(rec).includes("ann"), false, "records hold ids, never names");

  const lb = await call("bo", "GET", "/api/leaderboard");
  assert.equal(lb.rows.length, 2);
  // bo +100,000; ann -100,000 plus 2 full hours standing (20,000) before bo took it
  assert.deepEqual(lb.rows.map((r) => r.aura), [100000, -80000]);
});

test("a draw changes nothing", async () => {
  const { call, tick } = setup();
  const f = await call("ann", "POST", "/api/farm", { style: "M" });
  tick(3600);
  const tk = await call("bo", "POST", "/api/take", { id: f.id, style: "M" });
  assert.equal(tk.result.winner, null);
  assert.deepEqual(tk.result.deltas, [0, 0]);
  assert.equal(tk.captions[1], "MUTUAL MOG. +0 aura");
});

test("The Farm lists whoever has been farming the longest first", async () => {
  const { call, tick } = setup();
  await call("ann", "POST", "/api/farm", { style: "D" });
  tick(3600); await call("bo", "POST", "/api/farm", { style: "R" });
  tick(3600); await call("cy", "POST", "/api/farm", { style: "M" });
  const rows = (await call("dee", "GET", "/api/board")).farms;
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[1].postedAt - rows[0].postedAt, rows[2].postedAt - rows[1].postedAt], [3600, 3600], "the oldest farm is first, the newest last");
});

test("at most 3 farms up at once; each stays up 24 hours, across midnight, then expires and says so", async () => {
  const { call, tick } = setup();   // T0 is 08:00 UTC on Jan 1
  for (let i = 0; i < 3; i++) await call("ann", "POST", "/api/farm", { style: "DRM"[i] });
  assert.equal((await call("ann", "POST", "/api/farm", { style: "D" })).status, 400);
  const open = (await call("bo", "GET", "/api/board")).farms;
  assert.equal(open.length, 3);
  const d0 = (await call("bo", "POST", "/api/take", { id: open[0].id, style: "D" })).result.deltas[0];
  tick(16 * 3600 + 1);     // 00:00:01 on Jan 2: past midnight UTC, the other two are still up
  assert.equal((await call("bo", "GET", "/api/board")).farms.length, 2);
  const d1 = (await call("bo", "POST", "/api/take", { id: open[1].id, style: "D" })).result.deltas[0];
  tick(8 * 3600);          // 08:00:01 on Jan 2: 24 hours since ann posted
  assert.equal((await call("bo", "GET", "/api/board")).farms.length, 0);
  assert.equal((await call("ann", "GET", `/api/farm?id=${open[2].id}`)).status, "expired");
  assert.equal((await call("bo", "POST", "/api/take", { id: open[2].id, style: "D" })).status, 400);
  // ann's untaken farm shows as expired, so she can see her time was up
  assert.equal((await call("ann", "GET", "/api/today")).farms.filter((x) => x.status === "expired").length, 1);
  // aura counts on the day it happened: Jan 1 has the first take and 16 hours standing (08:00-24:00);
  // Jan 2 has the second take and 8 hours standing (00:00-08:00, the farm taken at 00:00:01 adds no full hour)
  const name = (await call("ann", "GET", "/api/today")).name;
  const aura = async (day) => (await call("ann", "GET", "/api/leaderboard?day=" + day)).rows.find((r) => r.name === name).aura;
  assert.equal(await aura("2027-01-01"), d0 + 160000);
  assert.equal(await aura("2027-01-02"), d1 + 80000);
});

test("each finished farm sends the registry a checkpoint of the ledger: public facts, never a player", async () => {
  const { env, call } = setup();
  for (let i = 0; i < 2; i++) {
    const f = await call("ann", "POST", "/api/farm", { style: "D" });
    await call("bo", "POST", "/api/take", { id: f.id, style: i ? "M" : "R" });   // DRIP beats RIZZ; MOG beats DRIP
  }
  const rows = env.DB.raw.prepare("SELECT * FROM ledger ORDER BY id").all();
  const sent = env.REGISTRY.checkpoints;
  assert.deepEqual(sent.map((c) => [c.game, c.entries, c.head]), [["aura-farm", 1, rows[0].hash], ["aura-farm", 2, rows[1].hash]]);
  assert.deepEqual(sent.map((c) => c.detail), [
    { day: "2027-01-01", farm: 1, result: "win", styles: ["DRIP", "RIZZ"], winner: "poster", aura: [100000, -100000], line: "Too much DRIP. RIZZ slipped." },
    { day: "2027-01-01", farm: 2, result: "win", styles: ["DRIP", "MOG"], winner: "taker", aura: [-100000, 100000], line: "MOG didn't blink. DRIP did." },
  ]);
  assert.equal(JSON.stringify(sent).includes("players"), false);
  assert.equal(JSON.stringify(sent).includes("ann"), false);
});

test("migrations 004 and 005 turn a v0.5 card duel into a farm and drop VIBES: the old ledger entry and result stay as sealed", async () => {
  const old = new DatabaseSync(":memory:");
  old.exec(execSync("git show a35b001:schema.sql", { encoding: "utf8" }));   // v0.5
  old.prepare("INSERT INTO players (id, token_hash, created_at, seen_at) VALUES (1, 'a', 1, 1), (2, 'b', 1, 1)").run();
  old.prepare("INSERT INTO duels (id, day, status, c_id, t_id, result, c_delta, t_delta, created_at, posted_at, taken_at) VALUES (7, '2027-01-01', 'done', 1, 2, '{\"winner\":0,\"deltas\":[110000,-10000],\"bonuses\":[]}', 110000, -10000, 1, 1, 100)").run();
  old.prepare("INSERT INTO duels (id, day, status, c_id, created_at, posted_at) VALUES (8, '2027-01-01', 'open', 1, 1, 1)").run();
  old.prepare("INSERT INTO ledger (kind, day, duel_id, record, prev_hash, hash, created_at) VALUES ('duel', '2027-01-01', 7, '{}', ?, ?, 5)")
    .run("0".repeat(64), sha("0".repeat(64) + "|{}"));
  for (const m of ["004_aura_farm", "005_no_vibes"]) old.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), "utf8"));
  assert.deepEqual({ ...old.prepare("SELECT id, kind, farm_id, record FROM ledger").get() }, { id: 1, kind: "duel", farm_id: 7, record: "{}" });
  assert.deepEqual({ ...old.prepare("SELECT status, c_delta, t_delta, c_style FROM farms WHERE id = 7").get() }, { status: "done", c_delta: 110000, t_delta: -10000, c_style: null });
  assert.equal(old.prepare("SELECT status FROM farms WHERE id = 8").get().status, "expired", "an open card duel can't be taken as a farm");
  const fresh = new DatabaseSync(":memory:");
  fresh.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const shape = (d) => d.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map((r) => r.name + ":" + d.prepare(`SELECT group_concat(name || ' ' || type || ' ' || "notnull", ',') AS c FROM pragma_table_info('${r.name}')`).get().c);
  assert.deepEqual(shape(old), shape(fresh));
});

test("save codes and passkeys: load your player on another device, log out only with a way back in", async () => {
  const { env, call } = setup();
  const f = await call("ann", "POST", "/api/farm", { style: "D" });
  assert.equal((await call("ann", "POST", "/api/logout")).status, 400, "no code or passkey yet");
  const { code } = await call("ann", "POST", "/api/codes", { action: "new" });
  assert.equal((await call("phone", "POST", "/api/load", { code: "WRONG" })).status, 404);
  assert.equal((await call("phone", "POST", "/api/load", { code })).status, 200);
  assert.equal((await call("phone", "GET", `/api/farm?id=${f.id}`)).side, 0, "the phone is ann now");
  assert.equal((await call("phone", "GET", "/api/account")).devices, 2);
  await call("phone", "POST", "/api/passkey", { action: "register", label: "phone", credential: { id: "key1" } });
  assert.equal((await call("ann", "GET", "/api/account")).passkeys.length, 1);
  assert.equal((await call("ann", "POST", "/api/logout")).status, 200);
  assert.equal((await call("ann", "GET", `/api/farm?id=${f.id}`)).side, -1, "logged out: ann's farm is just someone's again");
  assert.equal((await call("ann", "POST", "/api/passkey", { action: "login", credential: { id: "key1" } })).status, 200);
  assert.equal((await call("ann", "GET", `/api/farm?id=${f.id}`)).side, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM players").get().n, 1, "logging in never made a second player");
});

test("logging out goes back to this browser's own player, so it never makes a new one", async () => {
  const { env, call } = setup();
  await call("ann", "POST", "/api/farm", { style: "D" });
  const { code } = await call("ann", "POST", "/api/codes", { action: "new" });
  const g = await call("cafe", "POST", "/api/farm", { style: "R" });       // the cafe browser's own player
  assert.equal((await call("cafe", "POST", "/api/load", { code })).status, 200);
  assert.equal((await call("cafe", "GET", `/api/farm?id=${g.id}`)).side, -1, "logged in as ann");
  assert.equal((await call("cafe", "POST", "/api/logout")).status, 200);
  assert.equal((await call("cafe", "GET", `/api/farm?id=${g.id}`)).side, 0, "back on the cafe's own player");
  assert.equal((await call("cafe", "POST", "/api/load", { code })).status, 200);
  assert.equal((await call("cafe", "POST", "/api/logout")).status, 200);
  assert.equal((await call("cafe", "GET", `/api/farm?id=${g.id}`)).side, 0, "and again");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM players").get().n, 2, "no new player was made");
});

test("logging out: if the browser's own player now has a save code or is gone, nothing is restored", async () => {
  const { env, call } = setup();
  await call("ann", "POST", "/api/farm", { style: "D" });
  const { code } = await call("ann", "POST", "/api/codes", { action: "new" });
  const g = await call("cafe", "POST", "/api/farm", { style: "R" });
  await call("cafe", "POST", "/api/load", { code });
  env.DB.raw.prepare("DELETE FROM farms WHERE id = ?").run(g.id);
  env.DB.raw.prepare("DELETE FROM players WHERE id = 2").run();            // the guest is gone
  assert.equal((await call("cafe", "POST", "/api/logout")).status, 200);
  assert.equal((await call("cafe", "GET", "/api/account")).player, false, "no player: starts fresh");
});

test("an ordinary click writes nothing: 'seen' times are saved at most every 15 minutes", async () => {
  const { env, call, tick } = setup();
  await call("ann", "POST", "/api/farm", { style: "D" });
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
  await call("ann", "POST", "/api/name");
  const before = (await call("ann", "GET", "/api/today")).name;
  const r = await call("ann", "POST", "/api/name", { name: "Typed Name" });
  assert.notEqual(r.name, "Typed Name");
  assert.notEqual(r.name, before);
  assert.match(r.name, /^\S.{1,14}\S$/);
  assert.equal((await call("ann", "GET", "/api/today")).name, r.name);
});
