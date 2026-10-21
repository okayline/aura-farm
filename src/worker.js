// AURA FARMING SIMULATOR Worker: cookie players, the challenge board, card-vs-card duels, VIBES, standing aura,
// the daily board and the ledger.
//
// A poster keeps 3 of their 5 cards in an order and puts it on the board. Whoever takes it does the same, and the
// two lineups face off card by card at once (public/engine/aura.js duel). Nobody has to come back.
//
// The server deals and keeps every secret: the seed and the poster's lineup. The browser only ever gets what its
// player is allowed to see (duelView). The rules are public/engine/aura.js, the same file the page loads.
//
// API (all JSON):
//   GET  /api/today                    the day, your name, aura today, VIBES, your challenges and duels
//   POST /api/draft                    deal a new challenge (or get your undrafted one back): both 5-card hands
//   POST /api/post  {id, slots}        lock in 3 of your 5 in order and put it on the board
//   GET  /api/board                    today's open challenges (who posted and their aura today, never cards)
//   GET  /api/duel?id=                 one duel, as you are allowed to see it
//   POST /api/vibes {id, slot}         before taking: spend 1 VIBES to see which card they play in that round (0-2)
//   POST /api/take  {id, slots}        take a challenge with 3 of your 5: the duel is decided and sealed at once
//   POST /api/name                     reroll your name: a new random two-word one (names can't be typed)
//   GET  /api/leaderboard?day=         a day's players by net aura
//   GET  /api/ledger?before=&limit=    finished duels, newest first
//   GET  /api/account                  your save codes, passkeys and devices
//   POST /api/codes {action, id}       "new": make a save code (shown once); "remove": forget one
//   POST /api/load  {code}             load the player a save code belongs to on this device (log in)
//   POST /api/passkey {action ...}     register_options / register / login_options / login / remove
//   POST /api/logout                   this browser forgets its player (needs a save code or passkey first)

import * as A from "../public/engine/aura.js";
import { sha256, commitment, head, chainInsert, verifyChain, isUnique } from "./ledger.js";
import { giveName } from "./names.js";

const COOKIE = "af";
const COOKIE_MAX_AGE = 400 * 86400;
const SEEN_EVERY = 900;   // 15 minutes

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (env.CANONICAL_HOST && url.hostname.endsWith(".workers.dev")) {
      return Response.redirect(`https://${env.CANONICAL_HOST}${url.pathname}${url.search}`, 301);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
    try {
      if (!env.DAILY_SECRET) return json({ error: "The server has no DAILY_SECRET set." }, 500);
      const route = ROUTES[`${req.method} ${url.pathname}`];
      if (!route) return json({ error: "No such thing." }, 404);
      await settleStale(env);
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof Oops) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something broke. Try again in a moment." }, 500);
    }
  },
};

class Oops extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const ROUTES = {
  "GET /api/today": today,
  "POST /api/draft": draft,
  "POST /api/post": post,
  "GET /api/board": board,
  "GET /api/duel": duel,
  "POST /api/take": take,
  "POST /api/vibes": vibes,
  "POST /api/name": setName,
  "GET /api/leaderboard": leaderboard,
  "GET /api/ledger": ledger,
  "GET /api/account": account,
  "POST /api/codes": codes,
  "POST /api/load": loadCode,
  "POST /api/passkey": passkey,
  "POST /api/logout": logout,
};

// ---------- helpers ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

// the clock, in unix seconds (tests move it with env.NOW)
let clock = () => Math.floor(Date.now() / 1000);
export function setClock(fn) { clock = fn; }
const now = () => clock();
const utcDay = (t = now()) => new Date(t * 1000).toISOString().slice(0, 10);
const dayEnd = (day) => Date.parse(day + "T00:00:00Z") / 1000 + 86400;

async function hmacHex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A duel's seed: nobody can work it out without the server secret. It goes on the ledger once the duel is over.
export const duelSeed = (secret, day, id) => hmacHex(secret, `duel:${day}:${id}`);

function randomHex(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,})`));
  return m ? m[1] : null;
}

const setCookie = (token) => `${COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;

// The player behind this request's cookie, or null. Never creates one (so crawlers don't make players).
// The first device's token is players.token_hash; a device loaded later with a save code or passkey has its own
// token in `sessions`.
async function findPlayer(req, env) {
  const token = readCookie(req);
  if (!token) return null;
  const h = await sha256(token);
  // one trip for both places a token can be; "seen" times are written at most every 15 minutes, so an ordinary click
  // is reads only
  const p = await env.DB.prepare(
    `SELECT id, name, seen_at, NULL AS s_seen FROM players WHERE token_hash = ?1
     UNION ALL SELECT p.id, p.name, p.seen_at, s.seen_at FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?1
     LIMIT 1`).bind(h).first();
  if (!p) return null;
  if (p.s_seen !== null && now() - p.s_seen >= SEEN_EVERY) await env.DB.prepare("UPDATE sessions SET seen_at = ? WHERE token_hash = ?").bind(now(), h).run();
  if (now() - p.seen_at >= SEEN_EVERY) await env.DB.prepare("UPDATE players SET seen_at = ? WHERE id = ?").bind(now(), p.id).run();
  return giveName(env, { id: p.id, name: p.name });
}

// The player behind this request, made on the spot if there isn't one. Returns { player, cookie? }.
async function needPlayer(req, env) {
  const found = await findPlayer(req, env);
  if (found) return { player: found };
  const token = newToken(), t = now();
  const r = await env.DB.prepare("INSERT INTO players (token_hash, created_at, seen_at) VALUES (?, ?, ?) RETURNING id, name")
    .bind(await sha256(token), t, t).first();
  return { player: await giveName(env, r), cookie: setCookie(token) };
}

async function mustPlayer(req, env) {
  const p = await findPlayer(req, env);
  if (!p) throw new Oops("Make or take a challenge first.", 401);
  return p;
}

async function body(req) {
  try { return await req.json(); } catch { throw new Oops("That request didn't make sense."); }
}

const withCookie = (res, cookie) => { if (cookie) res.headers.append("set-cookie", cookie); return res; };

async function getDuel(env, id) {
  if (!Number.isInteger(id) || id < 1) throw new Oops("Bad duel.");
  const d = await env.DB.prepare("SELECT * FROM duels WHERE id = ?").bind(id).first();
  if (!d) throw new Oops("No such duel.", 404);
  return d;
}

// Both hands and both lineups of a duel (null for a lineup not locked yet).
async function cardsOf(env, d) {
  const hands = A.deal(await duelSeed(env.DAILY_SECRET, d.day, d.id));
  const lines = [d.c_slots, d.t_slots].map((s, i) => (s ? A.lineupCards(hands[i], JSON.parse(s)) : null));
  return { hands, lines };
}

const sideOf = (d, player) => (player && d.c_id === player.id ? 0 : player && d.t_id === player.id ? 1 : -1);

// ---------- aura totals ----------

// Aura on a day, from that day's duel rows (each: c_id, t_id, status, c_delta, t_delta, posted_at, taken_at).
// Wins and losses of finished duels, plus standing: each posted challenge stands from posting until taken (or the
// day ends), counted once however many stood at the same time. Returns a Map of player id -> aura.
function aurasFrom(rows, day) {
  const end = Math.min(now(), dayEnd(day)), sum = new Map(), spans = new Map();
  const add = (id, n) => sum.set(id, (sum.get(id) || 0) + n);
  for (const r of rows) {
    if (r.status === "done") { add(r.c_id, r.c_delta); add(r.t_id, r.t_delta); }
    if (r.posted_at != null) {
      if (!spans.has(r.c_id)) spans.set(r.c_id, []);
      spans.get(r.c_id).push([r.posted_at, r.taken_at ?? end]);
    }
    if (r.posted_at != null) add(r.c_id, 0);   // a draft that was never posted doesn't count as playing
    if (r.t_id) add(r.t_id, 0);
  }
  for (const [id, sp] of spans) add(id, A.standing(sp));
  return sum;
}

const AURA_COLS = "c_id, t_id, status, c_delta, t_delta, posted_at, taken_at";

// One player's aura on a day. The statement goes in a batch with the call's other reads: one trip to the database.
const auraStmt = (env, playerId, day) => env.DB.prepare(
  `SELECT ${AURA_COLS} FROM duels WHERE day = ?1 AND c_id = ?2 UNION ALL SELECT ${AURA_COLS} FROM duels WHERE day = ?1 AND t_id = ?2`)
  .bind(day, playerId);

// Everyone's aura on a day, with their names (also batched).
const aurasStmt = (env, day) => env.DB.prepare(
  `SELECT d.c_id, d.t_id, d.status, d.c_delta, d.t_delta, d.posted_at, d.taken_at, pc.name AS c_name, pt.name AS t_name
   FROM duels d LEFT JOIN players pc ON pc.id = d.c_id LEFT JOIN players pt ON pt.id = d.t_id
   WHERE d.status IN ('open', 'done', 'expired') AND d.day = ?`).bind(day);
const namesFrom = (rows) => new Map(rows.flatMap((r) => [[r.c_id, r.c_name], [r.t_id, r.t_name]]));

const vibesStmt = (env, playerId, day = utcDay()) =>
  env.DB.prepare("SELECT balance FROM vibes WHERE player_id = ? AND day = ?").bind(playerId, day);
const vibesFrom = (rows) => (rows.length ? rows[0].balance : A.VIBES_START);

// ---------- finishing a duel ----------

// After every finished duel, the ledger up to that duel's entry goes into the shared registry (dungeon-items, bound
// as REGISTRY) as a checkpoint: its entry count and that entry's fingerprint, which covers every entry before it. The
// registry is timestamped on Bitcoin, so this ledger is too. Only a chain that checks out is sent, with a few public
// facts about the duel and never a player. A registry that's away never stops a duel: the next checkpoint covers it.
// (Copied from scoundrel.exe's checkpoint.)
async function checkpoint(env, duelId) {
  try {
    if (!env.REGISTRY) return;
    const end = await env.DB.prepare("SELECT id, record FROM ledger WHERE duel_id = ?").bind(duelId).first();
    if (!end) return;
    const rows = (await env.DB.prepare("SELECT id, record, prev_hash, hash FROM ledger WHERE id <= ? ORDER BY id").bind(end.id).all()).results;
    const v = await verifyChain(rows);
    if (!v.ok) return console.error("The ledger is broken at entry " + v.at + ": no checkpoint sent.");
    const r = JSON.parse(end.record);
    const detail = {
      day: r.day, duel: r.duel, result: r.result, score: r.won,
      winner: r.winner === 0 ? "challenger" : r.winner === 1 ? "taker" : null,
      aura: r.deltas, bonuses: r.bonuses.map((b) => b[0]),
    };
    const res = await env.REGISTRY.checkpoint({ game: "aura-farm", entries: rows.length, head: rows[rows.length - 1].hash, detail });
    if (res && res.error) console.error("The registry refused the checkpoint: " + res.error);
  } catch (e) { console.error(e); }
}

// The daily reset: drafts and open challenges from an earlier day expire. (Duels are decided when taken, so nothing
// is ever left halfway.)
let settledDay = null;   // this Worker instance already did today's reset (it runs again after midnight UTC)
async function settleStale(env) {
  const day = utcDay();
  if (settledDay === day) return;
  await env.DB.prepare("UPDATE duels SET status = 'expired' WHERE status IN ('draft', 'open') AND day < ?").bind(day).run();
  settledDay = day;
}

// ---------- what a player sees ----------

async function duelView(env, d, player) {
  const side = sideOf(d, player);
  const { hands, lines } = await cardsOf(env, d);
  const out = {
    id: d.id, day: d.day, status: d.status, side,
    names: null,
    // both hands are face up to anyone looking at the duel: what each side could keep
    hands,
    commits: [d.c_commit, d.t_commit],
    deadline: dayEnd(d.day),
  };
  if (side >= 0) out.mine = lines[side];
  // names, the ledger record of a finished duel, and a would-be taker's VIBES and peeks, in one trip
  const wantPeeks = d.status === "open" && side !== 0 && !!player;
  const [names, v, pk] = await env.DB.batch([
    env.DB.prepare(`SELECT (SELECT name FROM players WHERE id = ?1) AS c, (SELECT name FROM players WHERE id = ?2) AS t,
      (SELECT record FROM ledger WHERE duel_id = ?3) AS record`).bind(d.c_id, d.t_id, d.id),
    ...(wantPeeks ? [vibesStmt(env, player.id),
      env.DB.prepare("SELECT slot FROM peeks WHERE duel_id = ? AND player_id = ? ORDER BY slot").bind(d.id, player.id)] : []),
  ]);
  out.names = [names.results[0].c ?? null, names.results[0].t ?? null];
  if (d.status === "open" && side !== 0) {
    out.vibes = wantPeeks ? vibesFrom(v.results) : A.VIBES_START;
    out.peeks = wantPeeks ? pk.results.map((r) => ({ slot: r.slot, card: lines[0][r.slot] })) : [];
  }
  if (d.status === "done") {
    const r = JSON.parse(d.result);
    Object.assign(out, { result: r, lineups: lines, captions: [A.caption(r, 0), A.caption(r, 1)] });
    // A duel finished under older rules (its record's `rules` isn't this one): the seed re-deals differently now, so
    // show the cards and captions exactly as its ledger record has them, and no hands. After a DIP, cards that never
    // flipped were never revealed: those are null.
    const rec = names.results[0].record ? JSON.parse(names.results[0].record) : null;
    if (rec && rec.rules !== A.RULES) {
      const cards = rec.lineups ?? rec.flipped.map((l) => [0, 1, 2].map((i) => l[i] ?? null));
      Object.assign(out, { hands: null, lineups: cards, captions: rec.caption });
      if (side >= 0) out.mine = cards[side];
    }
  }
  return out;
}

// ---------- routes ----------

async function today(req, env) {
  const day = utcDay();
  const player = await findPlayer(req, env);
  const out = { day, nextIn: dayEnd(day) - now(), name: player?.name ?? null };
  if (!player) return json(out);
  const [a, v, list] = await env.DB.batch([auraStmt(env, player.id, day), vibesStmt(env, player.id, day), env.DB.prepare(
    `SELECT d.id, d.status, d.c_id, d.t_id, d.result, o.name AS opponent FROM duels d
     LEFT JOIN players o ON o.id = (CASE WHEN d.c_id = ?1 THEN d.t_id ELSE d.c_id END)
     WHERE (d.c_id = ?1 OR d.t_id = ?1) AND d.day = ?2 AND d.status != 'expired'
     ORDER BY d.id DESC LIMIT 30`).bind(player.id, day)]);
  out.aura = aurasFrom(a.results, day).get(player.id) || 0;
  out.vibes = vibesFrom(v.results);
  out.duels = list.results.map((d) => {
    const side = sideOf(d, player), row = { id: d.id, status: d.status, side, opponent: d.opponent ?? null };
    if (d.status === "done") row.caption = A.caption(JSON.parse(d.result), side);
    return row;
  });
  return json(out);
}

async function draft(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const day = utcDay();
  // an undrafted challenge comes back as it was: no re-dealing for a better hand
  let d = await env.DB.prepare("SELECT * FROM duels WHERE c_id = ? AND day = ? AND status = 'draft'").bind(player.id, day).first();
  if (!d) {
    const r = await env.DB.prepare("SELECT COUNT(*) AS k FROM duels WHERE c_id = ? AND day = ? AND status = 'open'").bind(player.id, day).first();
    if (r.k >= A.MAX_OPEN) throw new Oops(`You already have ${A.MAX_OPEN} challenges on the board.`);
    d = await env.DB.prepare("INSERT INTO duels (day, c_id, created_at) VALUES (?, ?, ?) RETURNING *").bind(day, player.id, now()).first();
  }
  return withCookie(json(await duelView(env, d, player)), cookie);
}

// A lineup's cards and its commitment (src/ledger.js commitment).
async function lockIn(env, d, side, slots) {
  const { hands, lines } = await cardsOf(env, d);
  const cards = A.lineupCards(hands[side], slots);
  if (!cards) throw new Oops("Pick 3 different cards from your hand, in the order they'll face off.");
  const salt = randomHex();
  return { cards, lines, slots: JSON.stringify(slots), salt, commit: await commitment(cards, salt) };
}

async function post(req, env) {
  const player = await mustPlayer(req, env);
  const b = await body(req);
  const d = await getDuel(env, b.id);
  if (d.c_id !== player.id || d.status !== "draft") throw new Oops("That isn't a challenge you can post.");
  const L = await lockIn(env, d, 0, b.slots);
  const r = await env.DB.prepare(
    `UPDATE duels SET status = 'open', c_slots = ?, c_salt = ?, c_commit = ?, posted_at = ?
     WHERE id = ? AND status = 'draft' AND (SELECT COUNT(*) FROM duels WHERE c_id = ? AND day = ? AND status = 'open') < ?`)
    .bind(L.slots, L.salt, L.commit, now(), d.id, player.id, d.day, A.MAX_OPEN).run();
  if (!r.meta.changes) throw new Oops(`You already have ${A.MAX_OPEN} challenges on the board.`);
  return json(await duelView(env, await getDuel(env, d.id), player));
}

async function board(req, env) {
  const day = utcDay();
  const player = await findPlayer(req, env);
  const [list, rows] = await env.DB.batch([env.DB.prepare(
    `SELECT d.id, d.c_id, d.posted_at, p.name FROM duels d JOIN players p ON p.id = d.c_id
     WHERE d.status = 'open' AND d.day = ? ORDER BY d.posted_at DESC LIMIT 100`).bind(day), aurasStmt(env, day)]);
  const results = list.results, auras = aurasFrom(rows.results, day);
  const out = results.map((r) => ({ id: r.id, name: r.name, aura: auras.get(r.c_id) || 0, postedAt: r.posted_at, mine: !!player && r.c_id === player.id }));
  return json({ day, challenges: out });
}

async function duel(req, env, url) {
  const player = await findPlayer(req, env);
  const d = await getDuel(env, Number(url.searchParams.get("id")));
  if (d.status === "draft" && sideOf(d, player) !== 0) throw new Oops("No such duel.", 404);
  return json(await duelView(env, d, player));
}

// Taking a challenge decides it: the duels row, its ledger entry and the loser's +1 VIBES in one batch.
async function take(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const b = await body(req);
  const d = await getDuel(env, b.id);
  if (d.status !== "open" || d.day !== utcDay()) throw new Oops("Someone already took that one, or it expired.");
  if (d.c_id === player.id) throw new Oops("You can't take your own challenge.");
  const L = await lockIn(env, d, 1, b.slots);
  const lines = [L.lines[0], L.cards];
  const r = A.duel(lines[0], lines[1]), t = now();
  const record = JSON.stringify({
    kind: "duel", rules: A.RULES, day: d.day, duel: d.id, players: [d.c_id, player.id],
    seed: await duelSeed(env.DAILY_SECRET, d.day, d.id),
    commits: [d.c_commit, L.commit], lineups: lines, salts: [d.c_salt, L.salt],
    result: r.how, winner: r.winner, won: r.won, deltas: r.deltas, bonuses: r.bonuses,
    caption: [A.caption(r, 0), A.caption(r, 1)], t,
  });
  const sealed = { sql: "EXISTS (SELECT 1 FROM duels WHERE id = ? AND status = 'done' AND t_id = ? AND ended_at = ?)", args: [d.id, player.id, t] };
  for (let i = 0; i < 6; i++) {
    const stmts = [
      env.DB.prepare(
        `UPDATE duels SET status = 'done', t_id = ?, t_slots = ?, t_salt = ?, t_commit = ?, result = ?, c_delta = ?, t_delta = ?,
           taken_at = ?, ended_at = ? WHERE id = ? AND status = 'open'`)
        .bind(player.id, L.slots, L.salt, L.commit, JSON.stringify(r), r.deltas[0], r.deltas[1], t, t, d.id),
      await chainInsert(env.DB, await head(env.DB), { day: d.day, duelId: d.id, record, t }, sealed),
    ];
    // losing earns +1 VIBES (up to 3) on today's count
    if (r.winner !== null) {
      stmts.push(env.DB.prepare(
        `INSERT INTO vibes (player_id, day, balance) SELECT ?1, ?2, MIN(?3, ?4 + 1)
           WHERE EXISTS (SELECT 1 FROM duels WHERE id = ?5 AND status = 'done' AND t_id = ?6 AND ended_at = ?7)
         ON CONFLICT (player_id, day) DO UPDATE SET balance = MIN(?3, balance + 1)`)
        .bind(r.winner === 0 ? player.id : d.c_id, utcDay(t), A.VIBES_MAX, A.VIBES_START, d.id, player.id, t));
    }
    let res;
    try { res = await env.DB.batch(stmts); }
    catch (e) {
      if (!isUnique(e)) throw e;
      // someone else sealed something first: build on the new head and try again
      continue;
    }
    if (!res[0].meta.changes) throw new Oops("Someone already took that one.");
    await checkpoint(env, d.id);
    return withCookie(json(await duelView(env, await getDuel(env, d.id), player)), cookie);
  }
  throw new Error("The ledger is busy. Try again.");
}

// Before taking: spend 1 VIBES to see which of their cards plays in one round. Kept per player and duel.
async function vibes(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const b = await body(req);
  const d = await getDuel(env, b.id);
  if (d.status !== "open" || d.day !== utcDay()) throw new Oops("Someone already took that one, or it expired.");
  if (d.c_id === player.id) throw new Oops("That's your own challenge.");
  if (!Number.isInteger(b.slot) || b.slot < 0 || b.slot >= A.ROUNDS) throw new Oops("Peek at round 1, 2 or 3.");
  const day = utcDay();
  const res = await env.DB.batch([
    env.DB.prepare("INSERT INTO vibes (player_id, day, balance) VALUES (?, ?, ?) ON CONFLICT (player_id, day) DO NOTHING")
      .bind(player.id, day, A.VIBES_START),
    // pay only for a round not peeked at yet
    env.DB.prepare(`UPDATE vibes SET balance = balance - 1 WHERE player_id = ?1 AND day = ?2 AND balance > 0
      AND NOT EXISTS (SELECT 1 FROM peeks WHERE duel_id = ?3 AND player_id = ?1 AND slot = ?4)`).bind(player.id, day, d.id, b.slot),
    env.DB.prepare("INSERT INTO peeks (duel_id, player_id, slot) SELECT ?, ?, ? WHERE changes() = 1").bind(d.id, player.id, b.slot),
  ]);
  if (!res[1].meta.changes) {
    const had = await env.DB.prepare("SELECT 1 AS y FROM peeks WHERE duel_id = ? AND player_id = ? AND slot = ?").bind(d.id, player.id, b.slot).first();
    if (!had) throw new Oops("You're out of VIBES for today. Losing a duel earns one.");
  }
  return withCookie(json(await duelView(env, d, player)), cookie);
}

async function setName(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const p = await giveName(env, player, { reroll: true });
  if (p.name === player.name) throw new Oops("Couldn't find a free name. Try again.");
  return withCookie(json({ name: p.name }), cookie);
}

async function leaderboard(req, env, url) {
  const day = url.searchParams.get("day") || utcDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Oops("Bad day.");
  const { results } = await aurasStmt(env, day).all();
  const names = namesFrom(results);
  const rows = [...aurasFrom(results, day)].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([id, aura]) => ({ name: names.get(id) ?? null, aura }));
  return json({ day, rows });
}

async function ledger(req, env, url) {
  const before = Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const { results } = await env.DB.prepare(
    "SELECT id, duel_id, record, prev_hash, hash, created_at FROM ledger WHERE id < ? ORDER BY id DESC LIMIT ?").bind(before, limit).all();
  return json({ entries: results.map((r) => ({ id: r.id, duel: r.duel_id, record: JSON.parse(r.record), prev: r.prev_hash, hash: r.hash })) });
}


// ---------- save codes and passkeys (kept by the shared Accounts service in dungeon-items) ----------
// This game keeps its own players and cookie. Save codes and passkeys belong to an account there; the account says
// which player here is yours. A player gets an account the first time they make a code or passkey.
// (Copied from scoundrel.exe, without its import of save codes from before accounts: this game never had any.)

const GAME = "aura-farm";
const ACC = (env) => { if (!env.ACCOUNTS) throw new Oops("Accounts are unavailable right now. Try again in a moment.", 503); return env.ACCOUNTS; };
const ipOf = (req) => req.headers.get("cf-connecting-ip") || "unknown";
const ok = (r) => { if (r && r.error) throw new Oops(r.error, r.status || 400); return r; };

// Load a player on this device: a new token for it in `sessions`. Returns the cookie.
async function newSession(env, playerId) {
  const token = newToken(), t = now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, player_id, created_at, seen_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), playerId, t, t).run();
  return setCookie(token);
}

// Fixed window per hashed IP and action. Returns true if allowed.
async function rateLimit(env, req, action, limit, windowSecs) {
  const key = action + ":" + (await sha256("ip:" + ipOf(req))).slice(0, 32);
  const t = now(), windowStart = t - (t % windowSecs);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, windowStart).first();
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(t - 86400).run();
  return row.count <= limit;
}

// This player's account id (or null; made on the spot with `make`).
async function accountFor(env, player, make = false) {
  const acc = ACC(env);
  let id = (await acc.accountOf(GAME, player.id)).accountId;
  if (id || !make) return id ?? null;
  id = (await acc.createAccount()).accountId;
  if (!ok(await acc.link(id, GAME, player.id)).linked) throw new Oops("That didn't work. Try again.");
  return id;
}

// Log this browser in as the account's player here: the one it already has, else this browser's own player (if it has
// no account yet), else a new one. Returns { player, cookie }.
async function enter(req, env, accountId) {
  const acc = ACC(env);
  let { playerId } = await acc.playerFor(accountId, GAME);
  if (!playerId) {
    const cur = await findPlayer(req, env);
    if (cur && !(await acc.accountOf(GAME, cur.id)).accountId) playerId = cur.id;
    else {
      if (!(await rateLimit(env, req, "new-player", 20, 3600))) throw new Oops("Too many new players from here. Try again later.", 429);
      const t = now();
      playerId = (await env.DB.prepare("INSERT INTO players (token_hash, created_at, seen_at) VALUES (?, ?, ?) RETURNING id").bind(await sha256(newToken()), t, t).first()).id;
    }
    playerId = ok(await acc.link(accountId, GAME, playerId)).playerId;
  }
  const p = await env.DB.prepare("SELECT id, name FROM players WHERE id = ?").bind(playerId).first();
  if (!p) throw new Oops("That player is gone.", 404);
  const player = await giveName(env, p);
  return { player, cookie: await newSession(env, player.id) };
}

async function account(req, env) {
  const player = await findPlayer(req, env);
  if (!player) return json({ player: false, name: null, codes: [], passkeys: [], devices: 0 });
  const id = await accountFor(env, player);
  const ways = id ? ok(await ACC(env).info(id)) : { codes: [], passkeys: [] };
  const devices = 1 + (await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?").bind(player.id).first()).n;
  return json({ player: true, name: player.name, codes: ways.codes, passkeys: ways.passkeys, devices });
}

async function codes(req, env) {
  const b = await body(req);
  if (b.action === "new") {
    const { player, cookie } = await needPlayer(req, env);
    const r = ok(await ACC(env).addCode(await accountFor(env, player, true)));
    return withCookie(json({ code: r.code }), cookie);
  }
  if (b.action === "remove") {
    const player = await mustPlayer(req, env);
    const id = await accountFor(env, player);
    if (!id) throw new Oops("No such save code.", 404);
    ok(await ACC(env).removeCode(id, Number(b.id)));
    return json({ ok: true });
  }
  throw new Oops("Unknown action.");
}

// Type a save code: this device becomes that player (the player it was before stays where it is).
async function loadCode(req, env) {
  const r = ok(await ACC(env).loginCode({ code: (await body(req)).code, ip: ipOf(req) }));
  const { player, cookie } = await enter(req, env, r.accountId);
  return withCookie(json({ name: player.name }), cookie);
}

async function passkey(req, env) {
  const b = await body(req), acc = ACC(env), origin = new URL(req.url).origin;
  if (b.action === "login_options") return json(ok(await acc.passkeyLoginOptions({ origin, ip: ipOf(req) })));
  if (b.action === "login") {
    const r = ok(await acc.passkeyLogin({ origin, ip: ipOf(req), credential: b.credential }));
    const { player, cookie } = await enter(req, env, r.accountId);
    return withCookie(json({ name: player.name }), cookie);
  }
  if (b.action === "register_options" || b.action === "register") {
    const { player, cookie } = await needPlayer(req, env);
    const accountId = await accountFor(env, player, true);
    const r = b.action === "register_options"
      ? await acc.passkeyRegisterOptions({ accountId, origin })
      : await acc.passkeyRegister({ accountId, origin, credential: b.credential, label: b.label });
    return withCookie(json(ok(r)), cookie);
  }
  if (b.action === "remove") {
    const player = await mustPlayer(req, env);
    const id = await accountFor(env, player);
    if (!id) throw new Oops("No such passkey.", 404);
    return json(ok(await acc.passkeyRemove(id, Number(b.id))));
  }
  throw new Oops("Unknown action.");
}

// Log out: this browser forgets its player. Only once the player has a save code or passkey, so nobody locks
// themselves out. A device loaded later just loses its session; the first device's token is replaced with one
// nobody has, so that old cookie stops working too.
async function logout(req, env) {
  const player = await findPlayer(req, env);
  const clear = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
  if (!player) return withCookie(json({ ok: true }), clear);
  const id = await accountFor(env, player);
  if (!(id ? await ACC(env).waysIn(id) : 0)) throw new Oops("Make a save code or passkey first, or you'd have no way back in.");
  const h = await sha256(readCookie(req));
  const s = await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
  if (!s.meta.changes) await env.DB.prepare("UPDATE players SET token_hash = ? WHERE id = ? AND token_hash = ?").bind(await sha256(newToken()), player.id, h).run();
  return withCookie(json({ ok: true }), clear);
}
