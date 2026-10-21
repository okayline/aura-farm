// The page: talks to /api/*, draws the aura-glow screens. The rules come from engine/aura.js (the Worker uses the same file).
import * as A from "./engine/aura.js";

const EMOJI = { D: "💎", H: "😏", S: "🗿", C: "🗣️" };
const COLOR = { D: "var(--D)", H: "var(--H)", S: "var(--S)", C: "var(--C)" };
const MOVE_WORD = { lock: "🔒 LOCK IN", farm: "🗿 FARM", dip: "💨 DIP" };
const $app = document.getElementById("app"), $tabs = document.getElementById("tabs");

let tab = "duels", me = null, view = null, picks = [], err = "", timer = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => (n >= 0 ? "+" : "-") + Math.abs(n).toLocaleString("en-US");

async function api(method, path, body) {
  const res = await fetch("/api/" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({ error: "The server didn't answer properly." }));
  if (!res.ok) throw new Error(data.error || "Something broke.");
  return data;
}

async function run(fn) {
  err = "";
  try { await fn(); } catch (e) { err = e.message; }
  draw();
}

// ---------- pieces ----------

function card(c, { small = false, pick = null, onclick = null, ghost = false } = {}) {
  const tag = onclick ? "button" : "div";
  const attrs = onclick ? ` data-act="${onclick}" type="button"` : "";
  if (!c) return `<${tag} class="card back"${attrs}>?</${tag}>`;
  if (A.isCap(c)) {
    return `<${tag} class="card${ghost ? " ghost" : ""}" style="--c: var(--X)"${attrs}><span class="r">🃏</span><span class="e">🤫</span>
      <span class="s"><span>CAP</span><span>0</span></span>${pick ? `<span class="pick">${pick}</span>` : ""}</${tag}>`;
  }
  const s = c[1], rank = c[0] === "T" ? "10" : c[0];
  return `<${tag} class="card${ghost ? " ghost" : ""}" style="--c: ${COLOR[s]}"${attrs} aria-label="${rank} ${A.STYLE[s]} ${A.aura(c)}">
    <span class="r">${rank}${small ? "" : " "}${A.SUIT[s]}</span><span class="e">${EMOJI[s]}</span>
    <span class="s"><span>${A.STYLE[s]}</span><span>${A.aura(c)}</span></span>${pick ? `<span class="pick">${pick}</span>` : ""}</${tag}>`;
}

const halo = (emoji, pot) => {
  const g = 8 + Math.round(Math.log2(Math.max(1, (pot || A.START_POT) / A.START_POT)) * 10) + 10;
  return `<div class="halo" style="box-shadow: 0 0 ${g}px ${Math.round(g / 4)}px rgba(255,111,207,.55)">${emoji}</div>`;
};

// ---------- screens ----------

function header() {
  return `<header>
    <div class="title">AURA FARMING SIMULATOR<small>NO CAP BATTLE EDITION 2027</small></div>
    <div class="me">${me?.name ? `<button class="link" data-act="rename">${esc(me.name)}</button><br>` : ""}
      ${me?.aura != null ? `<b>${num(me.aura)}</b> aura today<br>👀 VIBES ${me.vibes}` : "stand there. look cool."}</div>
  </header>`;
}

function duelsTab() {
  const list = (me?.duels || []).map((d) => `
    <button class="item" data-act="open:${d.id}" type="button">
      <span class="grow"><b>${d.status === "open" ? "Standing on the board" : d.status === "draft" ? "Not posted yet" : "vs " + esc(d.opponent || "?")}</b><br>
      <span class="small">${d.status === "live" ? `Round ${d.round} · pot ${num(d.pot)} · ${d.yourMove ? "<b style='color:var(--H)'>your move</b>" : "waiting on them"}`
        : d.status === "done" ? esc(d.caption) : d.status === "open" ? "farming 1,000 aura an hour" : "pick your 3"}</span></span>
      <span>›</span>
    </button>`).join("");
  return `<div class="panel"><div class="big glow">Your duels</div>
      <p class="small">Post up to 3 challenges. While one stands untaken you farm 1,000 aura an hour.</p>
      <button class="go" data-act="draft" type="button">🧍 NEW CHALLENGE</button></div>
    <div class="list">${list || `<p class="small">No duels yet today.</p>`}</div>`;
}

function boardTab(b) {
  const rows = (b?.challenges || []).map((c) => `
    <button class="item" data-act="${c.mine ? "open" : "look"}:${c.id}" type="button">
      ${halo("😎")}<span class="grow"><b>${esc(c.name)}</b><br><span class="small">${num(c.aura)} aura today${c.mine ? " · yours" : ""}</span></span>
      <span class="meme glow">${c.mine ? "STANDING" : "STARE DOWN ›"}</span></button>`).join("");
  return `<div class="panel"><div class="big glow">The board</div><p class="small">Open challenges. You see their 5 cards when you step up, never the 3 they kept.</p></div>
    <div class="list">${rows || `<p class="small">Nobody is standing on the board right now.</p>`}</div>`;
}

function boardOfDay(lb) {
  const rows = (lb?.rows || []).map((r, i) => `<div class="item"><span class="meme" style="width:28px">${i + 1}</span>
    <span class="grow">${esc(r.name)}</span><b class="glow">${num(r.aura)}</b></div>`).join("");
  return `<div class="panel"><div class="big glow">Most aura today</div><p class="small">Net aura: wins, losses and standing. Resets at midnight UTC.</p></div>
    <div class="list">${rows || `<p class="small">Nobody has any aura yet. Go farm.</p>`}</div>`;
}

function ledgerTab(l) {
  const rows = (l?.entries || []).map((e) => {
    const r = e.record;
    return `<div class="item entry"><span class="grow"><span class="meme glow">DUEL #${r.duel} · ${esc(r.caption[r.winner ?? 0])}</span><br>
      <span class="small">pot ${num(r.pot)} · ${r.moves.map((m) => m.map((x) => x.toUpperCase()).join("/")).join(", ")}</span><br>
      <code>${e.hash.slice(0, 16)}…</code></span></div>`;
  }).join("");
  return `<div class="panel"><div class="big glow">The ledger</div><p class="small">Every finished duel, sealed in a hash chain. Locked-in cards are sealed by a fingerprint, revealed at the showdown.</p></div>
    <div class="list">${rows || `<p class="small">No duels finished yet.</p>`}</div>`;
}

// picking 3 of 5 in order, for posting or taking
function pickScreen(v, side, title, action) {
  const mine = v.hands[side], theirs = v.hands[1 - side];
  return `<div class="panel"><div class="big glow">${title}</div>
      <p class="small">Tap 3 cards in the order you'll flip them. ${side === 0 ? "Whoever takes this gets the other 5." : "They already locked 3 of theirs."}</p></div>
    <div class="small">${side === 0 ? "Whoever steps up holds" : esc(v.names[0]) + " holds"}</div>
    <div class="cards five">${theirs.map((c) => card(c, { small: true })).join("")}</div>
    <div class="small">You hold</div>
    <div class="cards five">${mine.map((c, i) => card(c, { small: true, pick: picks.includes(i) ? picks.indexOf(i) + 1 : null, onclick: "pick:" + i })).join("")}</div>
    <button class="go" data-act="${action}" type="button" ${picks.length === 3 ? "" : "disabled"}>${side === 0 ? "🔒 LOCK IN & POST" : "😤 STARE DOWN"}</button>
    <button class="link" data-act="back" type="button">back</button>`;
}

function duelScreen(v) {
  const side = v.side >= 0 ? v.side : 1, other = 1 - side;
  if (v.status === "draft") return pickScreen(v, 0, "New challenge", "post");
  if (v.status === "open" && v.side !== 0) return pickScreen(v, 1, `Stare down ${esc(v.names[0])}`, "take");
  if (v.status === "open" || v.status === "expired") {
    return `<div class="panel"><div class="big glow">${v.status === "open" ? "Standing on the board" : "Nobody stepped up"}</div>
      <p class="small">${v.status === "open" ? "Farming 1,000 aura an hour until someone takes it." : "It expired at the daily reset."}</p></div>
      <div class="small">Your lineup</div><div class="cards">${(v.mine || []).map((c) => card(c)).join("")}</div>
      <button class="link" data-act="back" type="button">back</button>`;
  }
  const shown = v.shown || [[], []];
  const peeks = Object.fromEntries((v.reads || []).filter((r) => r.kind === "peek").map((r) => [r.slot, r.card]));
  const asks = (v.reads || []).filter((r) => r.kind === "ask");
  const theirs = [0, 1, 2].map((i) => shown[other][i] ? card(shown[other][i]) : peeks[i] ? card(peeks[i], { ghost: true })
    : v.status === "live" && v.vibes > 0 ? card(null, { onclick: "peek:" + i }) : card(null)).join("");
  const mine = [0, 1, 2].map((i) => v.mine ? card(v.mine[i], { ghost: i >= (v.flipped || 0) && v.status !== "done" }) : card(shown[side][i])).join("");
  const done = v.status === "done";
  const capText = done ? v.captions[side] : v.myMove ? `${MOVE_WORD[v.myMove]}. ${v.theyMoved ? "" : "Waiting on them…"}` : v.theyMoved ? "They picked. Your move." : "";
  const capColor = done ? (v.result.deltas[side] >= 0 ? "#ff6fcf" : "#d6cfee") : "#c9b8ff";
  return `
    <div class="row">${halo("😎", v.pot)}<div class="grow"><b class="glow">${esc(v.names[other] || "?")}</b><br>
      <span class="small">${v.status === "live" ? (v.theyMoved ? "picked" : "picking…") : ""}</span></div>
      <div class="small" style="text-align:right">Round ${Math.min(v.round, 3)} / 3<br>Duel #${v.id}</div></div>
    <div class="cards">${theirs}</div>
    <div class="pot"><div class="small">POT</div><div class="n">${num(v.pot)} AURA</div></div>
    <div class="cap" style="color:${capColor}">${esc(capText)}</div>
    <div class="cards">${mine}</div>
    <div class="row">${halo("🧍", v.pot)}<div class="grow"><b>you</b><br><span class="small">${asks.map((a) => `card ${a.slot + 1} ${a.above3 ? "is" : "isn't"} above 3`).join(" · ")}</span></div>
      ${v.status === "live" ? `<button class="chip" data-act="ask" type="button" ${v.vibes > 0 ? "" : "disabled"}>👀 ask (${v.vibes})</button>` : ""}</div>
    ${v.status === "live" && v.side >= 0 ? `<div class="moves">${A.MOVES.map((m) => `<button class="mv ${m}${v.myMove === m ? " on" : ""}" data-act="move:${m}" type="button" ${v.myMove ? "disabled" : ""}>${MOVE_WORD[m]}</button>`).join("")}</div>
      <p class="small" style="text-align:center">Picks are secret and flip together. Tap a ? to peek with VIBES.</p>` : ""}
    <button class="link" data-act="back" type="button">back</button>`;
}

let extra = null;   // the board, leaderboard or ledger, fetched for its tab

function draw() {
  clearTimeout(timer);
  const body = view ? duelScreen(view)
    : tab === "duels" ? duelsTab() : tab === "board" ? boardTab(extra) : tab === "top" ? boardOfDay(extra) : ledgerTab(extra);
  $app.innerHTML = header() + body + `<div class="err">${esc(err)}</div>`;
  $tabs.innerHTML = [["duels", "⚔️ Duels"], ["board", "🧍 Board"], ["top", "🏆 Today"], ["ledger", "📜 Ledger"]]
    .map(([k, w]) => `<button class="tab${!view && tab === k ? " on" : ""}" data-tab="${k}" type="button">${w}</button>`).join("");
  // a live duel waiting on the other side checks back every 10 seconds
  if (view && view.status === "live" && (view.myMove || !view.theyMoved)) timer = setTimeout(() => run(() => openDuel(view.id, true)), 10000);
}

async function loadToday() { me = await api("GET", "today"); }
async function loadTab() {
  extra = tab === "board" ? await api("GET", "board") : tab === "top" ? await api("GET", "leaderboard") : tab === "ledger" ? await api("GET", "ledger") : null;
}
async function openDuel(id, keepPicks = false) {
  view = await api("GET", "duel?id=" + id);
  if (!keepPicks) picks = [];
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-act]");
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; view = null; return run(async () => { await loadToday(); await loadTab(); }); }
  const [act, arg] = t.dataset.act.split(":");
  if (act === "pick") {
    const i = Number(arg);
    picks = picks.includes(i) ? picks.filter((x) => x !== i) : picks.length < 3 ? [...picks, i] : picks;
    return draw();
  }
  if (act === "back") { view = null; return run(async () => { await loadToday(); await loadTab(); }); }
  if (act === "open" || act === "look") return run(() => openDuel(Number(arg)));
  if (act === "draft") return run(async () => { view = await api("POST", "draft"); picks = []; await loadToday(); });
  if (act === "post") return run(async () => { view = await api("POST", "post", { id: view.id, slots: picks }); await loadToday(); });
  if (act === "take") return run(async () => { view = await api("POST", "take", { id: view.id, slots: picks }); await loadToday(); });
  if (act === "move") return run(async () => { view = await api("POST", "move", { id: view.id, round: view.round, move: arg }); await loadToday(); });
  if (act === "peek") return run(async () => { view = await api("POST", "vibes", { id: view.id, kind: "peek", slot: Number(arg) }); await loadToday(); });
  if (act === "ask") return run(async () => { view = await api("POST", "vibes", { id: view.id, kind: "ask" }); await loadToday(); });
  if (act === "rename") {
    const name = prompt("Your name (2 to 16 characters):", me?.name || "");
    if (name) return run(async () => { await api("POST", "name", { name }); await loadToday(); });
  }
});

run(loadToday);
