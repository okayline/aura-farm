// AURA FARMING SIMULATOR Worker: cookie players, the challenge board, async duels with secret moves, VIBES,
// standing aura, the daily board and the ledger.
//
// The server deals and keeps every secret: the seed, both lineups and this round's picks. The browser only ever
// gets what its player is allowed to see (duelView). The rules are public/engine/aura.js, the same file the page loads.
//
// API (all JSON):
//   GET  /api/today                    the day, your name, aura (today and all time), VIBES, your challenges and duels
//   POST /api/draft                    deal a new challenge (or get your undrafted one back): both 5-card hands
//   POST /api/post  {id, slots}        lock in 3 of your 5 in order and put the challenge on the board
//   GET  /api/board                    today's open challenges (who posted and their aura today, never cards)
//   GET  /api/duel?id=                 one duel, as you are allowed to see it
//   POST /api/take  {id, slots}        take a challenge with 3 of your 5
//   POST /api/move  {id, round, move}  your secret pick for this round: lock | farm | dip
//   POST /api/vibes {id, kind, slot}   spend 1 VIBES: kind "peek" (see one of their unflipped cards) or "ask"
//                                      (is their next card above 3?)
//   POST /api/name  {name}             pick a name
//   GET  /api/leaderboard?day=         a day's players by net aura
//   GET  /api/ledger?before=&limit=    finished duels, newest first

import * as A from "../public/engine/aura.js";
import { sha256, commitment, head, chainInsert, isUnique } from "./ledger.js";
import { giveName } from "./names.js";

const COOKIE = "af";
const COOKIE_MAX_AGE = 400 * 86400;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.\- ]{0,14}[A-Za-z0-9_.\-]$/;
const RESERVED = new Set(["admin", "webmaster", "anonymous", "nobody", "system", "aura", "cap", "no cap"]);

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
  "POST /api/move": move,
  "POST /api/vibes": vibes,
  "POST /api/name": setName,
  "GET /api/leaderboard": leaderboard,
  "GET /api/ledger": ledger,
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
async function findPlayer(req, env) {
  const token = readCookie(req);
  if (!token) return null;
  const p = await env.DB.prepare("SELECT id, name FROM players WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!p) return null;
  await env.DB.prepare("UPDATE players SET seen_at = ? WHERE id = ?").bind(now(), p.id).run();
  return giveName(env, p);
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
const COL = ["c", "t"];

// ---------- aura totals ----------

// A player's standing aura on a day: their posted challenges, each standing from posting until taken (or the day
// ends), counted once however many stood at the same time.
async function standingOn(env, playerId, day) {
  const { results } = await env.DB.prepare(
    "SELECT posted_at, taken_at FROM duels WHERE c_id = ? AND day = ? AND posted_at IS NOT NULL").bind(playerId, day).all();
  const end = Math.min(now(), dayEnd(day));
  return A.standing(results.map((r) => [r.posted_at, r.taken_at ?? end]));
}

async function auraOn(env, playerId, day) {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN c_id = ?1 THEN c_delta ELSE t_delta END), 0) AS s
     FROM duels WHERE status = 'done' AND day = ?2 AND (c_id = ?1 OR t_id = ?1)`).bind(playerId, day).first();
  return r.s + (await standingOn(env, playerId, day));
}

async function auraLife(env, playerId) {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN c_id = ?1 THEN c_delta ELSE t_delta END), 0) AS s
     FROM duels WHERE status = 'done' AND (c_id = ?1 OR t_id = ?1)`).bind(playerId).first();
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT day FROM duels WHERE c_id = ? AND posted_at IS NOT NULL").bind(playerId).all();
  let s = r.s;
  for (const { day } of results) s += await standingOn(env, playerId, day);
  return s;
}

async function vibesOf(env, playerId, day = utcDay()) {
  const r = await env.DB.prepare("SELECT balance FROM vibes WHERE player_id = ? AND day = ?").bind(playerId, day).first();
  return r ? r.balance : A.VIBES_START;
}

// ---------- finishing a duel ----------

// Seal a duel that play() says is over: the duels row and its ledger entry in one batch.
async function finish(env, d, moves, state, { dipper = null } = {}) {
  const { lines } = await cardsOf(env, d);
  const r = state.result, t = now();
  const showdown = r.how === "showdown" || r.how === "tie";
  const record = JSON.stringify({
    kind: "duel", day: d.day, duel: d.id, players: [d.c_id, d.t_id],
    seed: await duelSeed(env.DAILY_SECRET, d.day, d.id),
    commits: [d.c_commit, d.t_commit],
    flipped: lines.map((l) => l.slice(0, state.flipped)),
    lineups: showdown ? lines : null,
    salts: showdown ? [d.c_salt, d.t_salt] : null,
    moves, pot: state.pot, result: r.how, winner: r.winner, deltas: r.deltas,
    bonuses: r.bonuses, caption: [A.caption(r, 0), A.caption(r, 1)], t,
  });
  for (let i = 0; i < 6; i++) {
    const stmts = [
      env.DB.prepare(
        `UPDATE duels SET status = 'done', moves = ?, n = ?, c_move = NULL, t_move = NULL, result = ?, c_delta = ?, t_delta = ?, ended_at = ?
         WHERE id = ? AND status = 'live' AND n = ?`)
        .bind(JSON.stringify(moves), moves.length, JSON.stringify(r), r.deltas[0], r.deltas[1], t, d.id, d.n),
      await chainInsert(env.DB, await head(env.DB), { day: d.day, duelId: d.id, record, t },
        { sql: "EXISTS (SELECT 1 FROM duels WHERE id = ? AND status = 'done' AND ended_at = ?)", args: [d.id, t] }),
    ];
    // a DIP you chose earns +1 VIBES (up to 3) on today's count
    if (dipper !== null) {
      const pid = dipper === 0 ? d.c_id : d.t_id;
      stmts.push(env.DB.prepare(
        `INSERT INTO vibes (player_id, day, balance) SELECT ?1, ?2, MIN(?3, ?4 + 1)
           WHERE EXISTS (SELECT 1 FROM duels WHERE id = ?5 AND status = 'done' AND ended_at = ?6)
         ON CONFLICT (player_id, day) DO UPDATE SET balance = MIN(?3, balance + 1)`)
        .bind(pid, utcDay(), A.VIBES_MAX, A.VIBES_START, d.id, t));
    }
    try { await env.DB.batch(stmts); return; }
    catch (e) {
      if (!isUnique(e)) throw e;
      // someone else sealed something first: build on the new head and try again
    }
  }
  throw new Error("The ledger is busy. Try again.");
}

// Once both picks of a round are in, play the round. Safe to call twice: the n guard lets one request do it.
async function resolve(env, id) {
  const d = await getDuel(env, id);
  if (d.status !== "live" || !d.c_move || !d.t_move) return;
  const { lines } = await cardsOf(env, d);
  const moves = [...JSON.parse(d.moves), [d.c_move, d.t_move]];
  const state = A.play(lines[0], lines[1], moves);
  if (state.over) {
    const dippers = [d.c_move, d.t_move].map((m) => m === "dip");
    await finish(env, d, moves, state, { dipper: dippers[0] && !dippers[1] ? 0 : dippers[1] && !dippers[0] ? 1 : null });
    return;
  }
  await env.DB.prepare(
    "UPDATE duels SET moves = ?, n = ?, c_move = NULL, t_move = NULL WHERE id = ? AND status = 'live' AND n = ?")
    .bind(JSON.stringify(moves), moves.length, d.id, d.n).run();
}

// The daily reset: a live duel from an earlier day ends now, a missing pick counting as a DIP (no VIBES for it);
// drafts and open challenges from an earlier day expire.
async function settleStale(env) {
  const day = utcDay();
  await env.DB.prepare("UPDATE duels SET status = 'expired' WHERE status IN ('draft', 'open') AND day < ?").bind(day).run();
  const { results } = await env.DB.prepare("SELECT * FROM duels WHERE status = 'live' AND day < ? LIMIT 20").bind(day).all();
  for (const d of results) {
    const { lines } = await cardsOf(env, d);
    const moves = [...JSON.parse(d.moves), [d.c_move || "dip", d.t_move || "dip"]];
    const state = A.play(lines[0], lines[1], moves);
    // every unfinished duel has an unfinished round, so a forced DIP always ends it
    await finish(env, d, moves, state);
  }
}

// ---------- what a player sees ----------

async function nameOf(env, id) {
  if (!id) return null;
  const r = await env.DB.prepare("SELECT name FROM players WHERE id = ?").bind(id).first();
  return r ? r.name : null;
}

async function duelView(env, d, player) {
  const side = sideOf(d, player);
  const { hands, lines } = await cardsOf(env, d);
  const moves = JSON.parse(d.moves);
  const out = {
    id: d.id, day: d.day, status: d.status, side,
    names: [await nameOf(env, d.c_id), await nameOf(env, d.t_id)],
    // both hands are face up to anyone looking at the duel: what each side could keep
    hands,
    commits: [d.c_commit, d.t_commit],
    moves,
    deadline: dayEnd(d.day),
  };
  if (side >= 0) out.mine = lines[side];
  if (d.status === "live" || d.status === "done") {
    const state = A.play(lines[0], lines[1], moves);
    out.round = state.round; out.pot = state.pot; out.flipped = state.flipped;
    out.shown = lines.map((l) => l.slice(0, state.flipped));
  }
  if (d.status === "live" && side >= 0) {
    out.myMove = d[COL[side] + "_move"];
    out.theyMoved = !!d[COL[1 - side] + "_move"];
    out.reads = JSON.parse(d[COL[side] + "_reads"]);
    out.vibes = await vibesOf(env, player.id);
  }
  if (d.status === "done") {
    const r = JSON.parse(d.result);
    out.result = r;
    if (r.how === "showdown" || r.how === "tie") out.shown = lines;
    out.captions = [A.caption(r, 0), A.caption(r, 1)];
  }
  return out;
}

// ---------- routes ----------

async function today(req, env) {
  const day = utcDay();
  const player = await findPlayer(req, env);
  const out = { day, nextIn: dayEnd(day) - now(), name: player?.name ?? null };
  if (!player) return json(out);
  out.aura = await auraOn(env, player.id, day);
  out.life = await auraLife(env, player.id);
  out.vibes = await vibesOf(env, player.id, day);
  const { results } = await env.DB.prepare(
    `SELECT * FROM duels WHERE (c_id = ?1 OR t_id = ?1) AND (day = ?2 OR status = 'live') AND status != 'expired'
     ORDER BY id DESC LIMIT 30`).bind(player.id, day).all();
  out.duels = [];
  for (const d of results) {
    const side = sideOf(d, player), row = { id: d.id, status: d.status, side, opponent: await nameOf(env, side === 0 ? d.t_id : d.c_id) };
    if (d.status === "live") {
      const v = await duelView(env, d, player);
      Object.assign(row, { round: v.round, pot: v.pot, yourMove: !v.myMove });
    }
    if (d.status === "done") row.caption = A.caption(JSON.parse(d.result), side);
    out.duels.push(row);
  }
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

async function lockIn(env, d, side, slots) {
  const { hands } = await cardsOf(env, d);
  const cards = A.lineupCards(hands[side], slots);
  if (!cards) throw new Oops("Pick 3 different cards from your hand, in the order you'll flip them.");
  const salt = randomHex();
  return { slots: JSON.stringify(slots), salt, commit: await commitment(cards, salt) };
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
  const { results } = await env.DB.prepare(
    "SELECT id, c_id, posted_at FROM duels WHERE status = 'open' AND day = ? ORDER BY posted_at DESC LIMIT 100").bind(day).all();
  const out = [];
  for (const r of results) {
    out.push({ id: r.id, name: await nameOf(env, r.c_id), aura: await auraOn(env, r.c_id, day), postedAt: r.posted_at, mine: !!player && r.c_id === player.id });
  }
  return json({ day, challenges: out });
}

async function duel(req, env, url) {
  const player = await findPlayer(req, env);
  const d = await getDuel(env, Number(url.searchParams.get("id")));
  if (d.status === "draft" && sideOf(d, player) !== 0) throw new Oops("No such duel.", 404);
  return json(await duelView(env, d, player));
}

async function take(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const b = await body(req);
  const d = await getDuel(env, b.id);
  if (d.status !== "open" || d.day !== utcDay()) throw new Oops("Someone already took that one, or it expired.");
  if (d.c_id === player.id) throw new Oops("You can't take your own challenge.");
  const L = await lockIn(env, d, 1, b.slots);
  const r = await env.DB.prepare(
    "UPDATE duels SET status = 'live', t_id = ?, t_slots = ?, t_salt = ?, t_commit = ?, taken_at = ? WHERE id = ? AND status = 'open'")
    .bind(player.id, L.slots, L.salt, L.commit, now(), d.id).run();
  if (!r.meta.changes) throw new Oops("Someone already took that one.");
  return withCookie(json(await duelView(env, await getDuel(env, d.id), player)), cookie);
}

async function move(req, env) {
  const player = await mustPlayer(req, env);
  const b = await body(req);
  if (!A.MOVES.includes(b.move)) throw new Oops("Pick LOCK IN, FARM or DIP.");
  const d = await getDuel(env, b.id);
  const side = sideOf(d, player);
  if (side < 0 || d.status !== "live") throw new Oops("That duel isn't live.");
  if (b.round !== d.n + 1) throw new Oops("That round is already over. Refresh.");
  const col = COL[side] + "_move";
  const r = await env.DB.prepare(`UPDATE duels SET ${col} = ? WHERE id = ? AND status = 'live' AND n = ? AND ${col} IS NULL`)
    .bind(b.move, d.id, d.n).run();
  if (!r.meta.changes) throw new Oops("You already picked this round.");
  await resolve(env, d.id);
  return json(await duelView(env, await getDuel(env, d.id), player));
}

async function vibes(req, env) {
  const player = await mustPlayer(req, env);
  const b = await body(req);
  const d = await getDuel(env, b.id);
  const side = sideOf(d, player);
  if (side < 0 || d.status !== "live") throw new Oops("That duel isn't live.");
  const { lines } = await cardsOf(env, d);
  const theirs = lines[1 - side], flipped = d.n;
  const reads = JSON.parse(d[COL[side] + "_reads"]);
  let read;
  if (b.kind === "peek") {
    if (!Number.isInteger(b.slot) || b.slot < flipped || b.slot >= A.ROUNDS) throw new Oops("Peek at a card that hasn't flipped.");
    if (reads.some((x) => x.kind === "peek" && x.slot === b.slot)) throw new Oops("You already peeked at that one.");
    read = { kind: "peek", slot: b.slot, card: theirs[b.slot] };
  } else if (b.kind === "ask") {
    if (reads.some((x) => x.kind === "ask" && x.slot === flipped)) throw new Oops("You already asked about that card.");
    read = { kind: "ask", slot: flipped, above3: A.aura(theirs[flipped]) > 3 };
  } else throw new Oops("Peek or ask.");
  const day = utcDay();
  const col = COL[side] + "_reads";
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT INTO vibes (player_id, day, balance) VALUES (?, ?, ?) ON CONFLICT (player_id, day) DO NOTHING`)
      .bind(player.id, day, A.VIBES_START),
    env.DB.prepare("UPDATE vibes SET balance = balance - 1 WHERE player_id = ? AND day = ? AND balance > 0").bind(player.id, day),
    env.DB.prepare(`UPDATE duels SET ${col} = ? WHERE id = ? AND ${col} = ? AND changes() = 1`)
      .bind(JSON.stringify([...reads, read]), d.id, d[col]),
  ]);
  if (!res[1].meta.changes) throw new Oops("You're out of VIBES for today. DIP to earn one.");
  return json(await duelView(env, await getDuel(env, d.id), player));
}

async function setName(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const b = await body(req);
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (!NAME_RE.test(name)) throw new Oops("Names are 2 to 16 letters, numbers, spaces, dots, dashes or underscores.");
  if (RESERVED.has(name.toLowerCase())) throw new Oops("That name is taken.");
  try {
    await env.DB.prepare("UPDATE players SET name = ?, name_key = ? WHERE id = ?").bind(name, name.toLowerCase(), player.id).run();
  } catch (e) {
    if (isUnique(e)) throw new Oops("That name is taken.");
    throw e;
  }
  return withCookie(json({ name }), cookie);
}

async function leaderboard(req, env, url) {
  const day = url.searchParams.get("day") || utcDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Oops("Bad day.");
  const { results } = await env.DB.prepare(
    `SELECT c_id AS id FROM duels WHERE day = ?1 AND posted_at IS NOT NULL
     UNION SELECT t_id FROM duels WHERE day = ?1 AND t_id IS NOT NULL`).bind(day).all();
  const rows = [];
  for (const { id } of results) rows.push({ name: await nameOf(env, id), aura: await auraOn(env, id, day) });
  rows.sort((a, b) => b.aura - a.aura);
  return json({ day, rows: rows.slice(0, 100) });
}

async function ledger(req, env, url) {
  const before = Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const { results } = await env.DB.prepare(
    "SELECT id, duel_id, record, prev_hash, hash, created_at FROM ledger WHERE id < ? ORDER BY id DESC LIMIT ?").bind(before, limit).all();
  return json({ entries: results.map((r) => ({ id: r.id, duel: r.duel_id, record: JSON.parse(r.record), prev: r.prev_hash, hash: r.hash })) });
}
