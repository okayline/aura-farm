// AURA FARMING SIMULATOR Worker: cookie players, the board of farms, takes, standing aura, the daily board and
// the ledger.
//
// AURA FARM (v0.6): a poster puts a style (DRIP, RIZZ or MOG) on the board, sealed, and farms aura while it stands.
// Whoever takes it picks a style of their own, and the two are revealed and faced off at once (public/engine/aura.js
// farm). Nobody has to come back. Once a style is revealed it is public: a player's record is their latest styles.
//
// The server keeps the one secret: a posted style until its farm is taken. The browser only ever gets what its
// player is allowed to see (farmView). The rules are public/engine/aura.js, the same file the page loads.
//
// API (all JSON):
//   GET  /api/today                    the day, your name, aura today, your farms
//   POST /api/farm  {style}            put a farm on the board with a sealed style (at most 3 up at once, 24 hours each)
//   GET  /api/board                    one row per farm that is up: its poster, their record (never a style)
//   GET  /api/farm?id=                 one farm, as you are allowed to see it
//   POST /api/take  {id, style}        take a farm with your style: both are revealed and sealed on the ledger at once
//   POST /api/name                     reroll your name: a new random two-word one (names can't be typed)
//   POST /api/pic   {pic}              pick your profile pic, one of A.PICS (none picked: the page picks one from the name)
//   GET  /api/leaderboard?day=         a day's players by net aura (today's also has the last 7 days: `weekly`)
//   GET  /api/ledger?before=&limit=    finished farms, newest first
//   GET  /api/account                  your save codes, passkeys and devices
//   POST /api/codes {action, id}       "new": make a save code (shown once); "remove": forget one
//   POST /api/load  {code}             load the player a save code belongs to on this device (log in)
//   POST /api/passkey {action ...}     register_options / register / login_options / login / remove
//   POST /api/logout                   this browser forgets its player (needs a save code or passkey first)

import * as A from "../public/engine/aura.js";
import { sha256, commitment, head, chainInsert, verifyTip, isUnique } from "./ledger.js";
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
  "POST /api/farm": postFarm,
  "GET /api/board": board,
  "GET /api/farm": farmOf,
  "POST /api/take": take,
  "POST /api/name": setName,
  "POST /api/pic": setPic,
  "GET /api/leaderboard": leaderboard,
  "GET /api/ledger": ledger,
  "GET /api/account": account,
  "POST /api/codes": codes,
  "POST /api/load": loadCode,
  "POST /api/passkey": passkey,
  "POST /api/logout": logout,
  "GET /api/carry": carryPage,
  "POST /api/pin": pinCopy,
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
export function setClock(fn) { clock = fn; leaderboardCache = null; }
const now = () => clock();
const utcDay = (t = now()) => new Date(t * 1000).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(day + "T00:00:00Z") / 1000;
const dayEnd = (day) => dayStart(day) + 86400;
// a farm comes down 24 hours after it was posted, if nobody took it first
const farmEnd = (d) => d.posted_at + A.LIFE;

function randomHex(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(req, name = COOKIE) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]{20,})`));
  return m ? m[1] : null;
}

const setCookie = (token) => `${COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
const clearCookie = (name) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
// This browser's own player (one with no save code or passkey), kept while the browser is logged in as someone else,
// so logging out goes back to it instead of making a new player.
const HOME = COOKIE + "h";
const setHome = (token) => `${HOME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;

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
    `SELECT id, name, pic, seen_at, NULL AS s_seen FROM players WHERE token_hash = ?1
     UNION ALL SELECT p.id, p.name, p.pic, p.seen_at, s.seen_at FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?1
     LIMIT 1`).bind(h).first();
  if (!p) return null;
  if (p.s_seen !== null && now() - p.s_seen >= SEEN_EVERY) await env.DB.prepare("UPDATE sessions SET seen_at = ? WHERE token_hash = ?").bind(now(), h).run();
  if (now() - p.seen_at >= SEEN_EVERY) await env.DB.prepare("UPDATE players SET seen_at = ? WHERE id = ?").bind(now(), p.id).run();
  return giveName(env, { id: p.id, name: p.name, pic: p.pic });
}

// The player behind this request, made on the spot if there isn't one. Returns { player, cookie? }.
async function needPlayer(req, env) {
  const found = await findPlayer(req, env);
  if (found) return { player: found };
  if (!(await rateLimit(env, req, "new-guest", 3, 3600))) throw new Oops("Too many new players from here. Try again later.", 429);
  const token = newToken(), t = now();
  const r = await env.DB.prepare("INSERT INTO players (token_hash, created_at, seen_at) VALUES (?, ?, ?) RETURNING id, name")
    .bind(await sha256(token), t, t).first();
  return { player: await giveName(env, r), cookie: setCookie(token) };
}

async function mustPlayer(req, env) {
  const p = await findPlayer(req, env);
  if (!p) throw new Oops("Put a farm up or take one first.", 401);
  return p;
}

async function body(req) {
  try { return await req.json(); } catch { throw new Oops("That request didn't make sense."); }
}

const withCookie = (res, cookie) => { for (const c of [cookie].flat()) if (c) res.headers.append("set-cookie", c); return res; };

async function getFarm(env, id) {
  if (!Number.isInteger(id) || id < 1) throw new Oops("Bad farm.");
  const d = await env.DB.prepare("SELECT * FROM farms WHERE id = ?").bind(id).first();
  if (!d) throw new Oops("No such farm.", 404);
  return d;
}

const sideOf = (d, player) => (player && d.c_id === player.id ? 0 : player && d.t_id === player.id ? 1 : -1);

const posed = (s, what) => { if (!A.isStyle(s)) throw new Oops(`Pick ${what}: DRIP, RIZZ or MOG.`); return s; };

// ---------- aura totals ----------

// Aura on a UTC day, from the farms that were up that day (each: c_id, t_id, status, c_delta, t_delta, posted_at,
// taken_at). A farm can span midnight, so each thing counts on the day it happened: a win or loss on the day the farm
// was taken, and standing for the hours it stood within the day (from posting until taken or its 24 hours ran out),
// earning from the oldest one standing at any moment (A.standing). Returns a Map of player id -> aura.
function aurasFrom(rows, day) {
  const from = dayStart(day), end = Math.min(now(), dayEnd(day)), sum = new Map(), spans = new Map();
  const add = (id, n) => sum.set(id, (sum.get(id) || 0) + n);
  for (const r of rows) {
    if (r.posted_at == null) continue;   // a farm that was never posted doesn't count as playing
    if (r.status === "done" && r.taken_at >= from && r.taken_at < dayEnd(day)) {
      add(r.c_id, r.c_delta); add(r.t_id, r.t_delta);
    }
    const f = Math.max(r.posted_at, from), t = Math.min(r.taken_at ?? farmEnd(r), end);
    if (t <= f) continue;
    if (!spans.has(r.c_id)) spans.set(r.c_id, []);
    spans.get(r.c_id).push([f, t, r.posted_at]);
    add(r.c_id, 0);
  }
  for (const [id, sp] of spans) add(id, A.standing(sp));
  return sum;
}

const AURA_COLS = "c_id, t_id, status, c_delta, t_delta, posted_at, taken_at";

// The farms that could count on a day: posted that day or the day before (a farm is up at most 24 hours).
const daysOf = (day) => [utcDay(dayStart(day) - 86400), day];
// the last n UTC days up to and including this one, oldest first. Everything on a player's Home was posted within the last
// 48 hours (a farm lives 24 and is listed for 24 more), so those 3 days hold it, and the (c_id, day) indexes can be used.
const daysBack = (day, n) => Array.from({ length: n }, (_, i) => utcDay(dayStart(day) - (n - 1 - i) * 86400));

// One player's aura on a day. The statement goes in a batch with the call's other reads: one trip to the database.
const auraStmt = (env, playerId, day) => env.DB.prepare(
  `SELECT ${AURA_COLS} FROM farms WHERE day IN (?1, ?2) AND c_id = ?3 UNION ALL SELECT ${AURA_COLS} FROM farms WHERE day IN (?1, ?2) AND t_id = ?3`)
  .bind(...daysOf(day), playerId);

// Everyone's aura on a day. No names here: the leaderboard looks up names for the top 100 only.
const aurasStmt = (env, day) => env.DB.prepare(
  `SELECT ${AURA_COLS} FROM farms WHERE status IN ('open', 'done', 'expired') AND day IN (?, ?)`).bind(...daysOf(day));

// ---------- records ----------

// The latest styles each of these players has played, newest first (A.RECORD of them): public once revealed, so read
// from finished farms only. One statement for any number of players. Returns a Map of player id -> ["D", "M", ...].
const recordsStmt = (env, ids) => env.DB.prepare(
  `SELECT p, style, id FROM (
     SELECT c_id AS p, c_style AS style, id FROM farms WHERE status = 'done' AND c_style IS NOT NULL AND c_id IN (SELECT value FROM json_each(?1))
     UNION ALL
     SELECT t_id, t_style, id FROM farms WHERE status = 'done' AND t_style IS NOT NULL AND t_id IN (SELECT value FROM json_each(?1))
   ) ORDER BY id DESC`).bind(JSON.stringify([...new Set(ids)]));
function recordsFrom(rows) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.p)) by.set(r.p, []); by.get(r.p).push({ id: r.id, style: r.style }); }
  return new Map([...by].map(([p, list]) => [p, A.record(list)]));
}

// ---------- finishing a farm ----------

// After every finished farm, the ledger up to that farm's entry goes into the shared registry (dungeon-items, bound
// as REGISTRY) as a checkpoint: its entry count and that entry's fingerprint, which covers every entry before it. The
// registry is timestamped on Bitcoin, so this ledger is too. Only a chain that checks out is sent, with a few public
// facts about the farm and never a player. A registry that's away never stops a farm: the next checkpoint covers it.
// (Copied from scoundrel.exe's checkpoint.) It reads only that entry and the one before it (verifyTip), so it costs the
// same however long the ledger is. Entries are never deleted, so an entry's id is the entry count up to it.
async function checkpoint(env, farmId) {
  try {
    if (!env.REGISTRY) return;
    const end = await env.DB.prepare("SELECT id, record FROM ledger WHERE farm_id = ?").bind(farmId).first();
    if (!end) return;
    const rows = (await env.DB.prepare("SELECT id, record, prev_hash, hash FROM ledger WHERE id <= ? ORDER BY id DESC LIMIT 2").bind(end.id).all()).results.reverse();
    const v = await verifyTip(rows);
    if (!v.ok) return console.error("The ledger is broken at entry " + v.at + ": no checkpoint sent.");
    const r = JSON.parse(end.record);
    const detail = {
      day: r.day, farm: r.farm, result: r.result, styles: r.styles.map((s) => A.STYLE[s]),
      winner: r.winner === 0 ? "poster" : r.winner === 1 ? "taker" : null, aura: r.deltas, ...(r.line ? { line: r.line } : {}),
    };
    const res = await env.REGISTRY.checkpoint({ game: "aura-farm", entries: end.id, head: rows[rows.length - 1].hash, detail });
    if (res && res.error) console.error("The registry refused the checkpoint: " + res.error);
  } catch (e) { console.error(e); }
}

// Farms whose 24 hours are up expire. (Farms are decided when taken, so nothing is ever left halfway.) Every read
// also checks the time itself, so a farm is never shown or taken after its 24 hours even before this runs.
let settledAt = 0;   // this Worker instance last expired farms then (at most once a minute)
async function settleStale(env) {
  if (now() - settledAt < 60) return;
  await env.DB.prepare("UPDATE farms SET status = 'expired' WHERE status = 'open' AND posted_at <= ?").bind(now() - A.LIFE).run();
  settledAt = now();
}

// ---------- what a player sees ----------

// A farm as this player may see it. The poster's style is secret until the farm is taken; then both are public.
async function farmView(env, d, player) {
  const side = sideOf(d, player);
  if (d.status === "open" && d.posted_at != null && farmEnd(d) <= now()) d = { ...d, status: "expired" };   // its 24 hours are up
  const out = { id: d.id, day: d.day, status: d.status, side, names: null, pics: null, commits: [d.c_commit, d.t_commit], deadline: d.posted_at == null ? null : farmEnd(d),
    postedAt: d.posted_at ?? null, takenAt: d.taken_at ?? null, left: d.posted_at == null || d.status !== "open" ? null : Math.max(0, farmEnd(d) - now()) };   // left: seconds, so the page's own clock doesn't matter
  // names, pics, the poster's record and the ledger record of a finished farm, in one trip
  const [names, rec] = await env.DB.batch([
    env.DB.prepare(`SELECT (SELECT name FROM players WHERE id = ?1) AS c, (SELECT name FROM players WHERE id = ?2) AS t,
      (SELECT pic FROM players WHERE id = ?1) AS cp, (SELECT pic FROM players WHERE id = ?2) AS tp,
      (SELECT record FROM ledger WHERE farm_id = ?3) AS record, (SELECT id FROM ledger WHERE farm_id = ?3) AS entry,
      (SELECT hash FROM ledger WHERE farm_id = ?3) AS hash, (SELECT prev_hash FROM ledger WHERE farm_id = ?3) AS prev`).bind(d.c_id, d.t_id, d.id),
    recordsStmt(env, [d.c_id, d.t_id].filter(Boolean)),
  ]);
  out.names = [names.results[0].c ?? null, names.results[0].t ?? null];
  out.pics = [names.results[0].cp ?? null, names.results[0].tp ?? null];
  const records = recordsFrom(rec.results);
  out.records = [records.get(d.c_id) ?? [], d.t_id ? records.get(d.t_id) ?? [] : []];
  if (side === 0 && d.status === "open") out.mine = d.c_style;          // only the poster sees their own sealed style
  if (d.status === "done") {
    const r = JSON.parse(d.result);
    out.result = r;
    out.captions = [A.caption(r, 0), A.caption(r, 1)];
    const sealed = names.results[0].record ? JSON.parse(names.results[0].record) : null;
    if (sealed?.line) out.line = sealed.line;   // the line sealed with the farm (farms before v0.9 have none)
    // its seal: this screen is the entry's page, so it carries the whole entry (the record exactly as hashed, and both hashes)
    if (sealed) out.ledger = { entry: names.results[0].entry, record: names.results[0].record, prev: names.results[0].prev, hash: names.results[0].hash };
    // A farm finished under older rules (a card duel): show its cards and captions exactly as its ledger record has them.
    // After a DIP, cards that never flipped were never revealed: those are null.
    if (d.c_style) out.styles = [d.c_style, d.t_style];
    else {
      const cards = sealed ? sealed.lineups ?? sealed.flipped?.map((l) => [0, 1, 2].map((i) => l[i] ?? null)) : null;
      Object.assign(out, { cards, captions: sealed?.caption ?? out.captions });
    }
  }
  return out;
}

// ---------- routes ----------

async function today(req, env) {
  const day = utcDay();
  const player = await findPlayer(req, env);
  const out = { day, nextIn: dayEnd(day) - now(), name: player?.name ?? null, pic: player?.pic ?? null, id: player?.id ?? null };
  if (!player) return json(out);
  const [a, list] = await env.DB.batch([auraStmt(env, player.id, day), env.DB.prepare(
    `SELECT d.id, d.status, d.c_id, d.t_id, d.result, d.c_style, d.t_style, d.posted_at, d.taken_at, o.name AS opponent FROM farms d
     LEFT JOIN players o ON o.id = (CASE WHEN d.c_id = ?1 THEN d.t_id ELSE d.c_id END)
     WHERE (d.c_id = ?1 OR d.t_id = ?1) AND d.day IN (?5, ?6, ?7) AND ((d.status = 'open' AND d.posted_at > ?2) OR (d.status = 'done' AND d.taken_at >= ?3)
       OR (d.status != 'done' AND d.posted_at > ?4))
     ORDER BY d.id DESC LIMIT 30`).bind(player.id, now() - A.LIFE, Math.min(dayStart(day), now() - A.FLEX_WINDOW), now() - 2 * A.LIFE, ...daysBack(day, 3))]);   // (a FLEX from just before midnight UTC is still read, for the FLEX counter below)
  out.aura = aurasFrom(a.results, day).get(player.id) || 0;
  out.carry = carryView(await carried(env, player.id));   // (v0.108) the copy you carry: your account's pinned copy
  // the FLEX counter the FLEX button shows: farms up, and how long ago (seconds) each FLEX of the last 30 minutes was (the page counts the rest, with A.flexState)
  out.flex = {
    up: list.results.filter((d) => d.c_id === player.id && d.status === "open" && d.posted_at > now() - A.LIFE).length,
    ago: list.results.filter((d) => d.t_id === player.id && d.status === "done" && d.taken_at > now() - A.FLEX_WINDOW).map((d) => now() - d.taken_at),
  };
  out.farms = list.results.filter((d) => !(d.status === "done" && d.taken_at < dayStart(day))).map((d) => {
    // a farm past its 24 hours that the minute-by-minute expiry hasn't reached yet already reads as expired
    const status = d.status === "open" && farmEnd(d) <= now() ? "expired" : d.status;
    const side = sideOf(d, player), row = { id: d.id, status, side, opponent: d.opponent ?? null };
    if (d.status === "done") {
      const r = JSON.parse(d.result); row.caption = A.caption(r, side); row.style = side === 0 ? d.c_style : d.t_style;
    }
    else if (side === 0) row.style = d.c_style;   // your own farm's sealed style, shown only to you
    if (status === "open" && d.posted_at != null) row.left = Math.max(0, farmEnd(d) - now());   // seconds until it comes down
    return row;
  });
  return json(out);
}

// Put a farm on the board: the style is sealed by a commitment, and the poster starts farming aura every hour.
async function postFarm(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const style = posed((await body(req)).style, "a style");
  const day = utcDay(), salt = randomHex(), t = now();
  const r = await env.DB.prepare(
    `INSERT INTO farms (day, status, c_id, c_style, c_salt, c_commit, created_at, posted_at)
     SELECT ?1, 'open', ?2, ?3, ?4, ?5, ?6, ?6 WHERE (SELECT COUNT(*) FROM farms WHERE c_id = ?2 AND status = 'open' AND posted_at > ?8) < ?7 RETURNING id`)
    .bind(day, player.id, style, salt, await commitment(style, salt), t, A.MAX_OPEN, t - A.LIFE).first();
  if (!r) throw new Oops(`You already have ${A.MAX_OPEN} farms on the board.`);
  leaderboardCache = null;
  return withCookie(json(await farmView(env, await getFarm(env, r.id), player)), cookie);
}

async function board(req, env) {
  const day = utcDay();
  const player = await findPlayer(req, env);
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.c_id, d.posted_at, p.name, p.pic FROM farms d JOIN players p ON p.id = d.c_id
     WHERE d.status = 'open' AND d.posted_at > ? ORDER BY d.posted_at, d.id LIMIT 100`).bind(now() - A.LIFE).all();
  const records = recordsFrom((await recordsStmt(env, results.map((r) => r.c_id)).all()).results);
  // one row per open farm (a player with 3 farms up has 3 rows)
  const farms = results.map((r) => ({ id: r.id, name: r.name, pic: r.pic ?? null, record: records.get(r.c_id) ?? [], postedAt: r.posted_at, up: now() - r.posted_at, mine: !!player && r.c_id === player.id }));   // up: seconds it has stood, so the page's own clock doesn't matter
  return json({ day, farms });
}

async function farmOf(req, env, url) {
  const player = await findPlayer(req, env);
  const d = await getFarm(env, Number(url.searchParams.get("id")));
  return json(await farmView(env, d, player));
}

// Taking a farm decides it: the farms row and its ledger entry in one batch.
async function take(req, env) {
  const player = await findPlayer(req, env);   // not needPlayer: a visitor with no player has no farm up, so they cannot FLEX, and no player is made for them
  const b = await body(req);
  const d = await getFarm(env, b.id);
  if (d.status !== "open" || farmEnd(d) <= now()) throw new Oops("Someone already took that one, or it expired.");
  if (d.c_id === player?.id) throw new Oops("You can't take your own farm.");
  const style = posed(b.style, "a style"), salt = randomHex(), commit = await commitment(style, salt);
  const t = now();
  // each farm you have up lets you FLEX once every FLEX_WINDOW (30 minutes): no farm up, or as many FLEXes in the last window as farms up, is a no
  const farmsUp = !player ? 0 : (await env.DB.prepare("SELECT COUNT(*) AS n FROM farms WHERE c_id = ? AND status = 'open' AND posted_at > ?").bind(player.id, t - A.LIFE).first()).n;
  const { results: recent } = !player ? { results: [] } : await env.DB.prepare("SELECT taken_at FROM farms WHERE t_id = ? AND taken_at > ? ORDER BY taken_at").bind(player.id, t - A.FLEX_WINDOW).all();
  if (!farmsUp) throw new Oops(`Put a farm up to FLEX: each farm you have up lets you FLEX once every ${A.FLEX_WINDOW / 60} minutes.`, 429);
  const f = A.flexState(farmsUp, recent.map((r) => r.taken_at), t);
  if (!f.ready) throw new Oops(`Each farm you have up lets you FLEX once every ${A.FLEX_WINDOW / 60} minutes. Next one in ${Math.ceil(f.wait / 60)} min.`, 429);
  const r = A.farm(d.c_style, style, Math.floor((t - d.posted_at) / 3600));
  const record = JSON.stringify({
    kind: "farm", rules: A.RULES, day: d.day, farm: d.id, players: [d.c_id, player.id],
    commits: [d.c_commit, commit], styles: [d.c_style, style], salts: [d.c_salt, salt],
    result: r.how, winner: r.winner, deltas: r.deltas,
    caption: [A.caption(r, 0), A.caption(r, 1)], line: A.line([d.c_style, style], d.id), t,
  });
  const sealed = { sql: "EXISTS (SELECT 1 FROM farms WHERE id = ? AND status = 'done' AND t_id = ? AND ended_at = ?)", args: [d.id, player.id, t] };
  for (let i = 0; i < 6; i++) {
    const stmts = [
      env.DB.prepare(
        `UPDATE farms SET status = 'done', t_id = ?, t_style = ?, t_salt = ?, t_commit = ?, result = ?, c_delta = ?, t_delta = ?,
           taken_at = ?, ended_at = ? WHERE id = ? AND status = 'open' AND posted_at > ?`)
        .bind(player.id, style, salt, commit, JSON.stringify(r), r.deltas[0], r.deltas[1], t, t, d.id, t - A.LIFE),
      await chainInsert(env.DB, await head(env.DB), { day: d.day, farmId: d.id, record, t }, sealed),
    ];
    let res;
    try { res = await env.DB.batch(stmts); }
    catch (e) {
      if (!isUnique(e)) throw e;
      // someone else sealed something first: build on the new head and try again
      continue;
    }
    if (!res[0].meta.changes) throw new Oops("Someone already took that one.");
    await checkpoint(env, d.id);
    // (v0.108) taking down a farm that stood 12 hours or more marks the taker's carried copy
    if (r.winner === 1 && t - d.posted_at >= 12 * 3600) await markCarry(env, player.id, "toppled_farm", "farm:" + d.id);
    leaderboardCache = null;
    return json(await farmView(env, await getFarm(env, d.id), player));
  }
  throw new Error("The ledger is busy. Try again.");
}

async function setName(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const p = await giveName(env, player, { reroll: true });
  if (p.name === player.name) throw new Oops("Couldn't find a free name. Try again.");
  return withCookie(json({ name: p.name }), cookie);
}

// Pick a profile pic from A.PICS. It stays when the name is rerolled.
async function setPic(req, env) {
  const { player, cookie } = await needPlayer(req, env);
  const pic = (await body(req)).pic;
  if (!A.isPic(pic)) throw new Oops("Pick one of the profile pics.");
  await env.DB.prepare("UPDATE players SET pic = ? WHERE id = ?").bind(pic, player.id).run();
  return withCookie(json({ pic }), cookie);
}

const LEADERBOARD_TTL = 30;   // seconds
let leaderboardCache = null;   // { day, at, out }
// The last 7 UTC days, rolling (today and the 6 before): each player's aura on each of those days added up, every day counted the
// way Today counts it. These are the farms that can touch those days: posted from 7 days ago, with the day before for ones that were still up.
const weekStmt = (env, day) => env.DB.prepare(
  `SELECT ${AURA_COLS} FROM farms WHERE status IN ('open', 'done', 'expired') AND day IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(daysBack(day, 8)));
function weeklyFrom(results, day) {
  const sum = new Map();
  for (const d of daysBack(day, 7)) for (const [id, aura] of aurasFrom(results, d)) sum.set(id, (sum.get(id) || 0) + aura);
  return sum;
}
async function leaderboard(req, env, url) {
  const day = url.searchParams.get("day") || utcDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Oops("Bad day.");
  const live = day === utcDay();
  // today's board (and the week's, which comes with it) is kept for LEADERBOARD_TTL seconds by this Worker instance; a farm posted or taken through it clears it
  if (live && leaderboardCache && leaderboardCache.day === day && now() - leaderboardCache.at < LEADERBOARD_TTL) return json(leaderboardCache.out);
  const [daily, week] = await env.DB.batch(live ? [aurasStmt(env, day), weekStmt(env, day)] : [aurasStmt(env, day)]);
  const top = [...aurasFrom(daily.results, day)].sort((a, b) => b[1] - a[1]).slice(0, 100);
  const topWeek = live ? [...weeklyFrom(week.results, day)].sort((a, b) => b[1] - a[1]).slice(0, 100) : [];
  const { results: who } = await env.DB.prepare("SELECT id, name, pic FROM players WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify([...new Set([...top, ...topWeek].map(([id]) => id))])).all();
  const by = new Map(who.map((p) => [p.id, p]));
  const row = ([id, aura]) => ({ name: by.get(id)?.name ?? null, pic: by.get(id)?.pic ?? null, aura });
  const out = live ? { day, rows: top.map(row), weekly: topWeek.map(row) } : { day, rows: top.map(row) };
  if (live) leaderboardCache = { day, at: now(), out };
  return json(out);
}

async function ledger(req, env, url) {
  const before = Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const { results } = await env.DB.prepare(
    "SELECT id, farm_id, record, prev_hash, hash, created_at FROM ledger WHERE id < ? ORDER BY id DESC LIMIT ?").bind(before, limit).all();
  return json({ entries: results.map((r) => ({ id: r.id, farm: r.farm_id, at: r.created_at, record: JSON.parse(r.record), prev: r.prev_hash, hash: r.hash })) });
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
  const cur = await findPlayer(req, env);
  const curIsGuest = cur && !(await acc.accountOf(GAME, cur.id)).accountId;
  let { playerId } = await acc.playerFor(accountId, GAME);
  if (!playerId) {
    if (curIsGuest) playerId = cur.id;
    else {
      if (!(await rateLimit(env, req, "new-player", 20, 3600))) throw new Oops("Too many new players from here. Try again later.", 429);
      const t = now();
      playerId = (await env.DB.prepare("INSERT INTO players (token_hash, created_at, seen_at) VALUES (?, ?, ?) RETURNING id").bind(await sha256(newToken()), t, t).first()).id;
    }
    playerId = ok(await acc.link(accountId, GAME, playerId)).playerId;
  }
  const p = await env.DB.prepare("SELECT id, name, pic FROM players WHERE id = ?").bind(playerId).first();
  if (!p) throw new Oops("That player is gone.", 404);
  const player = await giveName(env, p);
  const cookie = [await newSession(env, player.id)];
  if (curIsGuest && cur.id !== player.id) cookie.push(setHome(readCookie(req)));   // the browser's own player is left behind: remember it
  return { player, cookie };
}

async function account(req, env) {
  const player = await findPlayer(req, env);
  if (!player) return json({ player: false, name: null, pic: null, codes: [], passkeys: [], devices: 0 });
  const id = await accountFor(env, player);
  const ways = id ? ok(await ACC(env).info(id)) : { codes: [], passkeys: [] };
  const devices = 1 + (await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?").bind(player.id).first()).n;
  return json({ player: true, name: player.name, pic: player.pic ?? null, codes: ways.codes, passkeys: ways.passkeys, devices });
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

// Log out: this browser forgets its player and goes back to its own (the HOME cookie), if it had one. Only once the player has a save code or passkey, so nobody locks
// themselves out. A device loaded later just loses its session; the first device's token is replaced with one
// nobody has, so that old cookie stops working too.
async function logout(req, env) {
  const player = await findPlayer(req, env);
  if (!player) return withCookie(json({ ok: true }), [clearCookie(COOKIE), clearCookie(HOME)]);
  const id = await accountFor(env, player);
  if (!(id ? await ACC(env).waysIn(id) : 0)) throw new Oops("Make a save code or passkey first, or you'd have no way back in.");
  const h = await sha256(readCookie(req));
  const s = await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
  if (!s.meta.changes) await env.DB.prepare("UPDATE players SET token_hash = ? WHERE id = ? AND token_hash = ?").bind(await sha256(newToken()), player.id, h).run();
  // back to this browser's own player if it is still there and still has no account; else the browser starts fresh
  const home = readCookie(req, HOME);
  const hp = home && (await env.DB.prepare("SELECT id FROM players WHERE token_hash = ? AND id != ?").bind(await sha256(home), player.id).first());
  const back = hp && !(await accountFor(env, hp));
  return withCookie(json({ ok: true }), [back ? setCookie(home) : clearCookie(COOKIE), clearCookie(HOME)]);
}

// ---------- the carried copy (copied from TILT.EXE v0.19) ----------
// Your account's pinned copy from any game (dungeon-items registry.js pinned: the pin, else your newest copy), read when
// a run starts so the page can show it, and read again when a memorable moment marks it (markCarried: a deed mark made
// in this game, keyed so a retry makes no second mark). A Moon-blessed copy (a 4Dungeon mark) shows in gold. A registry
// that's away, or no copy, carries nothing and never stops a run.
async function carried(env, playerId) {
  try {
    const c = env.REGISTRY && env.REGISTRY.pinned ? await env.REGISTRY.pinned(GAME, playerId) : null;
    return c && c.itemId ? { ...c, blessed: c.marks.some((m) => m.kind === "moon" && m.value === "blessed") ? 1 : 0 } : null;
  } catch (e) { console.error(e); return null; }
}
const carryView = (c) => c ? { name: c.item.name, copy: c.copy, blessed: c.blessed } : null;
async function markCarry(env, playerId, value, key) {
  const c = await carried(env, playerId);
  if (!c) return;
  try {
    const r = await env.REGISTRY.markCarried({ itemId: c.itemId, copy: c.copy, by: { game: GAME, playerId }, kind: "deed", value, key });
    if (r && r.error) console.error("The registry refused the mark: " + r.error);
  } catch (e) { console.error(e); }
}

// The carry window (account panel's link): the registry's own page of every copy your account holds in any game, in
// Aura Farm's frame (dungeon-items carry-window.js). Its buttons pin through POST /api/pin. (v0.110) It also holds the
// save codes and passkeys (the routes below), which the account panel no longer shows.
//   GET  /api/carry               the window, as a page
//   POST /api/pin {itemId, copy}  pin it: every game carries it from your next run
async function carryPage(req, env) {
  const player = await findPlayer(req, env);
  if (!env.REGISTRY || !env.REGISTRY.carryWindow) throw new Oops("The registry is unavailable right now. Try again in a moment.", 503);
  const id = player ? await accountFor(env, player) : null;   // (v0.110) the window also shows save codes and passkeys
  const ways = { player: !!player, ...(id ? ok(await ACC(env).info(id)) : { codes: [], passkeys: [] }) };
  const html = await env.REGISTRY.carryWindow({ game: GAME, playerId: player ? player.id : 0, pinUrl: "/api/pin", back: "/", ways, embed: new URL(req.url).searchParams.get("embed") === "1",
    frame: { title: "✨ CARRY ✨", paper: "#0b0a12", ink: "#f4f1ff", edge: "#3a2f5c", accent: "#ff6fcf", font: 'Impact, "Arial Black", sans-serif' } });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
async function pinCopy(req, env) {
  const player = await findPlayer(req, env);
  if (!player) throw new Oops("Make a save code or passkey first.", 401);
  const b = await body(req);
  const r = await env.REGISTRY.pin({ game: GAME, playerId: player.id, itemId: Number(b.itemId), copy: Number(b.copy) });
  if (r && r.error) throw new Oops(r.error);
  return json({ ok: true });
}
