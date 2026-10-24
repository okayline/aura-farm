// The page: talks to /api/*, draws the aura-glow screens. The rules come from engine/aura.js (the Worker uses the same file).
import * as A from "./engine/aura.js";
import { VERSION } from "./engine/version.js";
import { reveal, revealing } from "./reveal.js";

const COLOR = { D: "var(--D)", R: "var(--H)", M: "var(--S)" };
const $app = document.getElementById("app"), $tabs = document.getElementById("tabs");

let tab = "farms", me = null, view = null, pick = null, err = "";
let flexed = false;   // you just tapped FLEX: the finished farm plays its reveal (reveal.js) once, right after
let acct = null, newCode = null, note = "";   // the "you" screen: account, a just-made save code, a line of news
let ask = null;   // an in-game "are you sure?" on the you screen: { act, arg, text } (no browser popups)
let picking = false;   // the you screen's profile pics are open to pick from

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => (n >= 0 ? "+" : "-") + Math.abs(n).toLocaleString("en-US");

async function api(method, path, body) {
  const res = await fetch("/api/" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({ error: "The server didn't answer properly." }));
  if (data && typeof data === "object") data._t = Date.now();   // when it arrived: a farm's `left` seconds count from here
  if (!res.ok) throw new Error(data.error || "Something broke.");
  return data;
}

async function run(fn) {
  err = "";
  try { await fn(); } catch (e) { err = e.message; }
  draw();
}

// ---------- time left ----------
// A farm sends the seconds it has left; the page turns that into a moment on its own clock when the answer arrives (_t),
// writes it into the page, and a timer redraws just those words, so nothing else on the screen is touched.
const clock = (ms) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m >= 1 ? `${m}m` : "under a minute"; };
// whole hours a farm has stood since it went up (ms)
const hoursUp = (since) => Math.floor(Math.min(Math.max(Date.now() - since, 0), A.LIFE * 1000) / 3600000);
// what a farm has earned by standing so far: 10,000 for each whole hour (this farm on its own; farms up together earn from the oldest)
const earnText = (since) => "+" + A.earned(hoursUp(since)).toLocaleString("en-US") + " aura";
// what a farm earns per hour, and what it moves if it is taken now
const rateText = "+" + A.STAND_PER_HOUR.toLocaleString("en-US") + " an hour";
const stakeText = (since, sign) => num(sign * A.stake(hoursUp(since))) + " aura";
const stakeSpan = (since, sign) => `<span data-stake="${since}" data-sign="${sign}">${stakeText(since, sign)}</span>`;
const earnSpan = (end) => `<span data-earn="${end - A.LIFE * 1000}">${earnText(end - A.LIFE * 1000)}</span>`;
// how long a farm has been up, in the words of The Farm's rows: "Up for 5 hrs" (minutes for the first hour)
const upText = (since) => { const m = Math.floor((Date.now() - since) / 60000); return "Up for " + (m < 60 ? Math.max(m, 0) + " min" : Math.floor(m / 60) + (m < 120 ? " hr" : " hrs")); };
const leftText = (end) => (end - Date.now() <= 0 ? "time's up" : clock(end - Date.now()) + " left");
const endOf = (x, from = x) => from._t + x.left * 1000;
const leftSpan = (end) => `<span class="left" data-end="${end}">${leftText(end)}</span>`;
const upSpan = (end) => `<span data-since="${end - A.LIFE * 1000}">${clock(Date.now() - (end - A.LIFE * 1000))}</span>`;
const barOf = (end) => `<div class="bar"><i data-bar="${end}" style="width:${Math.min(100, Math.max(0, 100 - ((end - Date.now()) / (A.LIFE * 10)))).toFixed(1)}%"></i></div>`;
setInterval(() => {
  let over = false;
  for (const n of document.querySelectorAll("[data-end]")) { n.textContent = leftText(+n.dataset.end); if (+n.dataset.end <= Date.now()) over = true; }
  for (const n of document.querySelectorAll("[data-since]")) n.textContent = clock(Date.now() - +n.dataset.since);
  for (const n of document.querySelectorAll("[data-earn]")) n.textContent = earnText(+n.dataset.earn);
  for (const n of document.querySelectorAll("[data-stake]")) n.textContent = stakeText(+n.dataset.stake, +n.dataset.sign);
  for (const n of document.querySelectorAll("[data-upfor]")) n.textContent = upText(+n.dataset.upfor);
  for (const n of document.querySelectorAll("[data-bar]")) n.style.width = Math.min(100, Math.max(0, 100 - ((+n.dataset.bar - Date.now()) / (A.LIFE * 10)))).toFixed(1) + "%";
  if (!over || revealing()) return;
  if (view && !view.you) api("GET", "farm?id=" + view.id).then((d) => { if (view && view.id === d.id) { view = d; draw(); } }).catch(() => {});   // its time is up: show it
  else if (!view) refreshMe();
}, 20000);

// ---------- pieces ----------

// A style: its name and a big emoji. A button to tap when `tap` is set (`on` marks the one picked),
// otherwise just shown.
function style(s, { tap = false, on = false, off = false } = {}) {
  const tag = tap ? "button" : "div", attrs = tap ? ` data-act="pick:${s}" type="button"${off ? " disabled" : ""}` : "";
  return `<${tag} class="card${on ? " on" : ""}" style="--c: ${COLOR[s]}"${attrs} aria-label="${A.STYLE[s]}">
    <span class="r">${A.STYLE[s]}</span><span class="e">${A.EMOJI[s]}</span></${tag}>`;
}
// the style cards to pick from, each with what it beats written under it ("beats 😏"), read off the rules
const styles = (off = false, beats = true) => `<div class="cards">${A.STYLES.map((s) => style(s, { tap: true, on: pick === s && !off, off })).join("")}</div>
  ${beats ? `<div class="cards beats">${A.STYLES.map((s) => `<span class="small">beats ${A.EMOJI[A.BEATS[s]]}</span>`).join("")}</div>` : ""}`;
const shown = (s) => `<div class="cards">${style(s, { on: true })}</div>`;

// the emoji for a style or a card code from a duel before v0.6 ("D3" is DRIP, "X1" the CAP; older codes show as text)
const emo = (s) => (s == null ? "❔" : s[0] === "X" ? "🤫" : A.EMOJI[s[0]] ?? s);

// A player's record: their latest styles, newest first, as emoji.
const recordLine = (rec) => (rec && rec.length ? rec.map(emo).join(" ") : "no flexes yet");

// A player's profile pic: the one they picked (v0.47), or else one of A.PICS chosen from their name, so it looks random but
// is the same for them everywhere and doesn't change when the page redraws.
const pic = (name, picked) => {
  if (A.isPic(picked)) return picked;
  let h = 2166136261; for (const c of String(name ?? "?").toLowerCase()) h = Math.imul(h ^ c.codePointAt(0), 16777619); return A.PICS[(h >>> 0) % A.PICS.length];
};
const halo = (emoji, glow = 18) => `<div class="halo" style="box-shadow: 0 0 ${glow}px ${Math.round(glow / 4)}px rgba(255,111,207,.55)">${emoji}</div>`;

// ---------- screens ----------

function header() {
  return `<header>
    <div class="title">AURA FARMING SIMULATOR<small>NO CAP BATTLE EDITION 2027</small></div>
    <div class="me"><button class="link" data-act="you" type="button">${me?.name ? esc(me.name) : "log in"}</button><br>
      ${me?.aura != null ? `<b>${num(me.aura)}</b> aura today` : "stand there. look cool."}</div>
  </header>`;
}

function farmsTab() {
  const full = (me?.farms || []).filter((f) => f.status === "open").length >= A.MAX_OPEN;   // all farms up: no more can be put up
  const list = (me?.farms || []).map((d) => `
    <button class="item home" data-act="open:${d.id}" type="button">
      <span class="grow"><b>${d.status === "open" ? "Farming " + emo(d.style) : d.status === "expired" ? "Your time is up" : "vs " + esc(d.opponent || "?")}</b><br>
      <span class="small">${d.status === "done" ? esc(d.caption) : d.status === "open" ? `${d.left != null ? rateText + " · " + leftSpan(endOf(d, me)) : ""}` : ""}</span></span>
      <span>${d.style && d.status === "done" ? emo(d.style) : ""} ›</span>
    </button>`).join("");
  return `<div class="panel"><div class="big glow">${me?.name ? esc(me.name) + "'s " : ""}AURA FARM</div>
      <p class="small">+10,000 Aura every hour while your Farm is up</p>
      <p class="small">Flex on someone currently Farming to start an AURA Battle!</p></div>
    ${styles(full, false)}
    <button class="go" data-act="farm" type="button" ${pick && !full ? "" : "disabled"}>🌾 FARM AURA</button>
    <div class="list">${list || `<p class="small">No farms yet today.</p>`}</div>`;
}

function boardTab(b) {
  const rows = (b?.farms || []).map((c) => `
    <button class="item" data-act="${c.mine ? "open" : "look"}:${c.id}" type="button">
      ${halo(pic(c.name, c.pic))}<span class="grow"><b>${esc(c.name)}</b><br><span class="small">${num(c.aura)} aura today${c.mine ? " · yours" : ""}</span><br>
      <span class="small">${recordLine(c.record)}</span></span>
      <span style="text-align:right"><span class="meme glow">${c.mine ? "FARMING" : "FLEX ›"}</span><br><span class="small" data-upfor="${(b._t ?? Date.now()) - c.up * 1000}">${upText((b._t ?? Date.now()) - c.up * 1000)}</span></span></button>`).join("");
  return `<div class="panel"><div class="big glow">The Farm</div></div>
    <div class="list">${rows || `<p class="small">Nobody is farming right now.</p>`}</div>`;
}

function boardOfDay(lb) {
  const rows = (lb?.rows || []).map((r, i) => `<div class="item"><span class="meme" style="width:28px">${i + 1}</span>
    ${halo(pic(r.name, r.pic), [18, 11, 5][i] ?? 0)}<span class="grow">${esc(r.name)}</span><b class="glow">${num(r.aura)}</b></div>`).join("");
  return `<div class="panel"><div class="big glow">AURA LEADERBOARD</div></div>
    <div class="list">${rows || `<p class="small">Nobody has any aura yet. Go farm.</p>`}</div>`;
}

function ledgerTab(l) {
  const rows = (l?.entries || []).map((e) => {
    const r = e.record;
    // your own farms read from your side (COOKED. -100,000 aura when you lost); farms you weren't in, from the winner's, as on the farm's page
    const mine = me?.id != null ? (r.players || []).indexOf(me.id) : -1, shownSide = mine >= 0 ? mine : r.winner ?? 0;
    const [title, line] = r.styles
      ? [`FARM #${r.farm} · ${esc(r.caption[shownSide])}`, r.styles.map(emo).join(" vs ")]
      // a card duel from before v0.6, as it was sealed
      : [`DUEL #${r.duel} · ${esc(r.caption[r.winner ?? 0])}`, (r.lineups ?? r.flipped ?? []).map((l) => [0, 1, 2].map((i) => emo(l[i])).join("")).join(" vs ") + (r.won ? ` · ${r.won[0]}-${r.won[1]}` : "")];
    // tap an entry to open its farm, which is the entry's page
    return `<button class="item entry" data-act="look:${e.farm}" type="button"><span class="grow"><span class="meme glow">${title}</span><br>
      ${r.line ? `<span class="small">${esc(r.line)}</span><br>` : ""}<span class="small">${line}</span><br><code>${e.hash.slice(0, 16)}…</code></span><span>›</span></button>`;
  }).join("");
  return `<div class="panel"><div class="big glow">Legends of AURA</div></div>
    <div class="list">${rows || `<p class="small">No farms finished yet.</p>`}</div>`;
}

// A finished farm's seal: its whole ledger entry (the record exactly as hashed, the previous entry's hash and its own),
// and the shared registry that keeps a checkpoint of it.
const seal = (v) => (v.ledger ? `<div class="small" style="text-align:center;margin-top:3em">📜 Ledger entry #${v.ledger.entry}<br>
  <a class="link" href="https://88x31.app/registry?head=${esc(v.ledger.hash)}" target="_blank" rel="noopener">On The Registry ›</a></div>
  <div class="small seal">record ${esc(v.ledger.record)}<br>prev ${esc(v.ledger.prev)}<br>hash ${esc(v.ledger.hash)}</div>` : "");

const at = (sec) => new Date(sec * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const kv = (k, val) => `<div class="kv"><span>${k}</span><span>${val}</span></div>`;
// A panel that starts rolled up and opens when tapped. It stays as you left it while the same screen redraws, and starts rolled up again on the next one.
const openBoxes = new Set();
const rolled = (id, title, inner, cls = "", style = "") => `<details class="panel ${cls}" data-box="${id}" style="${style}"${openBoxes.has(id) ? " open" : ""}><summary>${title}</summary>${inner}</details>`;
document.addEventListener("toggle", (e) => { const b = e.target.dataset?.box; if (b) e.target.open ? openBoxes.add(b) : openBoxes.delete(b); }, true);

// A finished farm's details, under the face-off: who, what they played, the aura, when, and how anyone can check the seal.
// (Hidden until the reveal has played, so it doesn't give the result away.)
function pastDetails(v, playing) {
  let rec = null; try { rec = v.ledger ? JSON.parse(v.ledger.record) : null; } catch { rec = null; }
  const win = v.result.winner, who = (i) => esc(v.names[i] || "?") + (v.side === i ? " (you)" : "");
  const played = (i) => (v.styles ? ` · ${emo(v.styles[i])} ${esc(A.STYLE[v.styles[i]] ?? "")}` : "");
  const verdict = win == null ? "A tie" : v.side >= 0 ? (win === v.side ? "You won" : "You lost") : `${esc(v.names[win] || "?")} won`;
  const proof = rec && v.styles ? [0, 1].map((i) => `<p class="small seal">${esc(v.names[i] || "?")} sealed ${esc(v.commits[i])}<br>then showed ${esc(v.styles[i])}|${esc(rec.salts?.[i] ?? "")}</p>`).join("") : "";
  return rolled("past", "Results", `
    ${kv("Result", verdict)}${kv("Put up by", who(0) + played(0) + " · " + num(v.result.deltas[0]))}${kv("Taken by", who(1) + played(1) + " · " + num(v.result.deltas[1]))}
    ${v.postedAt ? kv("Put up", at(v.postedAt)) : ""}${v.takenAt ? kv("Taken", at(v.takenAt)) : ""}${v.postedAt && v.takenAt ? kv("Stood for", clock((v.takenAt - v.postedAt) * 1000)) : ""}
    ${rec ? kv("Rules", "version " + rec.rules) : ""}
    ${v.records ? kv(`${esc(v.names[0] || "?")}'s latest styles`, recordLine(v.records[0])) + kv(`${esc(v.names[1] || "?")}'s latest styles`, recordLine(v.records[1])) : ""}
    ${proof}`, `detail${playing ? " wait" : ""}`, "margin-top:30px");
}

// Your own open farm: everything about it that is yours to see. The style is only ever sent to you; the commitment is
// public (a hash of the style and a secret salt), so showing it gives nothing away.
function openFarmPage(v, back) {
  const end = endOf(v), s = v.mine, loses = A.STYLES.find((x) => A.BEATS[x] === s);
  const open = (me?.farms || []).filter((f) => f.status === "open").length;
  return `<div class="small" style="text-align:center">Farm #${v.id}</div>
    <div class="panel" style="text-align:center">
      <div class="row" style="justify-content:center">${halo(pic(me?.name, me?.pic), 22)}<div class="big glow">${me?.name ? esc(me.name) + " is farming" : "Farming"}</div></div>
      <div class="time glow">${leftSpan(end)}</div>${barOf(end)}
      </div>
    <div style="width:170px;margin:14px auto 0">${style(s, { on: true })}</div>
    <div class="small" style="text-align:center;margin-top:10px">${esc(A.STYLE[s])} ${A.EMOJI[s]} beats ${esc(A.STYLE[A.BEATS[s]])} ${A.EMOJI[A.BEATS[s]]} and loses to ${esc(A.STYLE[loses])} ${A.EMOJI[loses]}.</div>
    ${rolled("open", "Details", `
      ${kv("Put up", at(v.postedAt))}${kv("Comes down", at(v.deadline))}${kv("Up for", upSpan(end))}${kv("Farmed so far", earnSpan(end))}
      ${kv("Earning", rateText)}${kv("At most", "+" + A.earned(A.LIFE / 3600).toLocaleString("en-US") + " if nobody takes it")}
      ${kv("If you win", stakeSpan(end - A.LIFE * 1000, 1))}${kv("If you lose", stakeSpan(end - A.LIFE * 1000, -1))}${kv("Goes up", `Win/lose +${A.STAKE_PER_HOUR.toLocaleString("en-US")} every hour`)}
      ${kv("Your aura today", me?.aura != null ? num(me.aura) : "…")}${kv("Your farms up", `${open} of ${A.MAX_OPEN}`)}
      ${kv("Your record", recordLine(v.records[0]))}
      <p class="small seal">${esc(v.commits[0])}</p>`, "", "margin-top:12px")}${back}`;
}

// Under the FLEX button: what is public about a farm you can take. Their style is never in here, only its sealed fingerprint.
function takeInfo(v) {
  const end = v.left != null ? endOf(v) : null, open = (me?.farms || []).filter((f) => f.status === "open").length;
  return rolled("take", "Details", `
    ${kv("Farm", "#" + v.id)}${kv("Put up by", esc(v.names[0] || "?"))}
    ${v.postedAt ? kv("Put up", at(v.postedAt)) : ""}${end ? kv("Comes down", at(v.deadline)) + kv("Time left", leftSpan(end)) + kv("Stood for", upSpan(end)) + kv("Aura farmed so far", earnSpan(end)) : ""}
    ${kv("If you win", end ? stakeSpan(end - A.LIFE * 1000, 1) : num(A.STAKE) + " aura")}${kv("If you lose", end ? stakeSpan(end - A.LIFE * 1000, -1) : num(-A.STAKE) + " aura")}${kv("Same style", num(0) + " aura")}${kv("Goes up", `+${A.STAKE_PER_HOUR.toLocaleString("en-US")} every hour it stands`)}
    ${kv("Your aura today", me?.aura != null ? num(me.aura) : "…")}${kv("Your farms up", `${open} of ${A.MAX_OPEN}`)}
    <p class="small seal">${esc(v.commits[0])}</p>`, "", "margin-top:12px");
}

function farmScreen(v) {
  const back = `<button class="link" data-act="back" type="button">back</button>`;
  if (v.status === "open" && v.side !== 0) {
    return `<div class="row">${halo(pic(v.names[0], v.pics?.[0]))}<div class="grow"><b class="glow">${esc(v.names[0])}</b><br>
        <span class="small">${recordLine(v.records[0])}</span></div></div>
        <div class="duel"><div class="face"><div class="slot"><div class="card back">?</div><div class="card" style="visibility:hidden"></div></div></div></div>
        <div style="text-align:center;margin:1em 0">VS.</div>
        ${styles()}
      <button class="go" data-act="take" type="button" ${pick ? "" : "disabled"}>😤 FLEX</button>${takeInfo(v)}${back}`;
  }
  if (v.status === "open" && v.left != null && v.mine) return openFarmPage(v, back);
  if (v.status === "open" || v.status === "expired") {
    return `<div class="panel"><div class="big glow">${v.status === "open" ? "Farming" : "Your time is up"}</div></div>
      ${v.mine ? `${shown(v.mine)}` : ""}${back}`;
  }
  // done: both styles, revealed (a card duel from before v0.6 shows its cards as emoji)
  // someone who wasn't in it (opened from the Ledger tab or a registry link) sees it from the winner's side, with names
  const side = v.side >= 0 ? v.side : v.result.winner ?? 1, other = 1 - side, d = v.result.deltas[side];
  const hand = (i) => (v.styles ? style(v.styles[i], { on: true }) : `<div class="small">${(v.cards?.[i] || []).map(emo).join(" ")}</div>`);
  // right after you FLEX, their card starts face down (the reveal flips it, and drains the loser when it's time)
  const playing = flexed && !!v.styles;
  const flip = (i) => (playing && i === other ? `<div class="slot"><div class="card back">?</div>${hand(i)}</div>` : hand(i));
  const face = (name, i, glow) => `<div class="face${v.result.winner != null && v.result.winner !== i && !playing ? " lost" : ""}">${halo(pic(v.names[i], v.pics?.[i]), glow)}<b class="glow">${name}</b>${flip(i)}</div>`;
  // the line and the caption, each cut into sentences ("Same DRIP." "Same Energy." "AURA FARMED." "+100,000 aura",
  // the amount bigger), which the reveal drops in one at a time
  const sentences = (t) => t.split(/(?<=\.) /), bit = (t, cls = "") => `<span class="bit ${cls}">${esc(t)}</span>`;
  return `<div class="small" style="text-align:center">Farm #${v.id}</div>
    <div class="duel">${face(esc(v.names[other] || "?"), other, 18)}
      <div class="cap" style="color:${d > 0 ? "var(--D)" : d < 0 ? "#ff4d5e" : "#d6cfee"}">${v.line ? `<div class="why">${sentences(v.line).map((t) => bit(t)).join(" ")}</div>` : ""}${sentences(v.captions[side]).map((t, i, all) => bit(t, i === all.length - 1 && all.length > 1 ? "amt" : "")).join(" ")}</div>
      ${face(v.side >= 0 ? "you" : esc(v.names[side] || "?"), side, d > 0 ? 30 : 12)}</div>${pastDetails(v, playing)}${seal(v)}${back}`;
}

// ---------- you: name, save codes and passkeys (kept by the shared Accounts, like the other 88x31 games) ----------

const md = (t) => (t ? new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

function youScreen() {
  const a = acct;
  if (!a) return `<div class="panel"><p class="small">Loading…</p></div>`;
  if (newCode) {
    return `<div class="panel"><div class="big glow">Your new save code</div>
        <p class="meme" style="font-size:20px;text-align:center;word-break:break-all">${esc(newCode)}</p>
        <p class="small">Write it down or keep it in a password manager. It won't be shown again. Anyone with it can log in as you.</p>
        <div class="row"><button class="chip" data-act="copycode" type="button">📋 Copy</button><button class="chip" data-act="savecode" type="button">⬇️ Download .txt</button></div></div>
      <button class="go" data-act="codedone" type="button">DONE</button>`;
  }
  const ways = [
    ...a.codes.map((c) => `<div class="item"><span class="grow">🔑 Save code<br><span class="small">made ${md(c.created_at)}${c.last_used_at ? " · last used " + md(c.last_used_at) : " · never used"}</span></span>
      <button class="link" data-act="forgetcode:${c.id}" type="button">forget</button></div>`),
    ...a.passkeys.map((k) => `<div class="item"><span class="grow">👆 Passkey: ${esc(k.label || "passkey")}<br><span class="small">${k.created_at ? "made " + md(k.created_at) : ""}</span></span>
      <button class="link" data-act="forgetkey:${k.id}" type="button">remove</button></div>`),
  ].join("");
  const hasWay = a.codes.length + a.passkeys.length > 0;
  const mine = pic(a.name, a.pic);
  // your pic, left of your name: tap it to pick another
  const head = a.player ? `<div class="row"><button class="halo" data-act="pics" type="button" aria-label="Pick your profile pic" style="border:0;box-shadow: 0 0 22px 5px rgba(255,111,207,.55)">${mine}</button>
      <div class="big glow">${esc(a.name || "You")}</div></div>` : `<div class="big glow">You</div>`;
  const pics = a.player && picking ? `<div class="small" style="margin-top:12px">Pick your profile pic</div>
      <div class="pics">${A.PICS.map((p) => `<button class="${p === mine ? "on" : ""}" data-act="setpic:${p}" type="button">${p}</button>`).join("")}</div>` : "";
  return `<div class="panel">${head}
      <p class="small">${a.player ? `On ${a.devices} browser${a.devices === 1 ? "" : "s"} or device${a.devices === 1 ? "" : "s"}. ` : ""}A save code or passkey lets you log in as this player anywhere. They work in the other 88x31 games too.</p>${pics}
      ${a.player ? `<button class="link" data-act="rename" type="button">🎲 reroll name</button>` : ""}</div>
    <div class="list">${ways || `<p class="small">No save codes or passkeys yet.</p>`}</div>
    <div class="row keys"><button class="chip" data-act="newcode" type="button">🔑 New code</button>
      ${pkSupported() ? `<button class="chip" data-act="addkey" type="button">👆 Add passkey</button>
      <button class="chip" data-act="loadkey" type="button">👆 Use passkey</button>` : ""}</div>
    <div class="panel"><div class="small">Log in as another player</div>
      <div class="row" style="margin-top:8px"><input id="code" class="chip grow" placeholder="SAVE-CODE" autocomplete="off" spellcheck="false" style="color:var(--ink)">
        <button class="chip" data-act="loadcode" type="button">Log in</button>
</div></div>
    ${ask ? `<div class="panel"><p class="small" style="text-align:center">${esc(ask.text)}</p>
      <div class="row"><button class="chip" data-act="yes" type="button">Yes</button><button class="chip" data-act="no" type="button">No</button></div></div>` : ""}
    ${a.player && hasWay ? `<button class="link" data-act="logout" type="button">log out of this browser</button>` : ""}
    <p class="small" style="text-align:center">${esc(note)}</p>
    <button class="link" data-act="back" type="button">back</button>`;
}

async function openYou() { view = { you: true }; newCode = null; ask = null; picking = false; acct = await api("GET", "account"); }

// the save code as a little text file, so it can be kept somewhere safe (from scoundrel.exe)
function downloadCode() {
  const text = ["AURA FARMING SIMULATOR save code", "", "  " + newCode, "",
    `This code logs you in as ${me?.name || "your player"} on any browser or device, here and in the other 88x31 games.`,
    `On that one: open ${location.origin}, tap "log in" at the top, and type it in.`,
    "Keep it private: anyone with this code can log in as you.", `Made ${new Date().toISOString().slice(0, 10)}.`, ""].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = "aura-farm-save-code.txt";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// The browser speaks WebAuthn in ArrayBuffers; the server speaks base64url. (From scoundrel.exe and the 88x31 cLuB.)
const pkSupported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
const fromB64 = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer; };
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deviceName = () => {
  const u = navigator.userAgent;
  return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows PC" : /Linux/.test(u) ? "Linux" : "this device";
};
const pkOops = (e) => new Error(e && e.name === "NotAllowedError" ? "Passkey cancelled (or it timed out)." : e && e.name === "InvalidStateError" ? "This device already has a passkey for you." : (e && e.message) || "The passkey didn't work.");

async function addPasskey() {
  try {
    const o = await api("POST", "passkey", { action: "register_options" });
    const cred = await navigator.credentials.create({ publicKey: {
      ...o, challenge: fromB64(o.challenge), user: { ...o.user, id: fromB64(o.user.id) },
      excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: fromB64(c.id) })),
    } });
    await api("POST", "passkey", { action: "register", label: deviceName(), credential: {
      id: cred.id, response: { clientDataJSON: toB64(cred.response.clientDataJSON), attestationObject: toB64(cred.response.attestationObject) },
    } });
  } catch (e) { throw pkOops(e); }
  acct = await api("GET", "account");
  // passkeys only work on this site's address: a save code is the backup if that ever changes
  note = acct.codes.length ? "Passkey saved." : "Passkey saved. Make a save code too, as a backup.";
}

async function loadWithPasskey() {
  let d;
  try {
    const o = await api("POST", "passkey", { action: "login_options" });
    const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: fromB64(o.challenge) } });
    d = await api("POST", "passkey", { action: "login", credential: {
      id: cred.id, response: { clientDataJSON: toB64(cred.response.clientDataJSON), authenticatorData: toB64(cred.response.authenticatorData), signature: toB64(cred.response.signature) },
    } });
  } catch (e) { throw pkOops(e); }
  await loggedIn(d.name);
}

async function loggedIn(name) {
  await loadToday(); acct = await api("GET", "account");
  note = `Logged in as ${name || "your player"}. Welcome back.`;
}

let extra = null;   // the board, leaderboard or ledger shown on its tab
const cache = {};   // each tab's last data: a tab shows it the moment you tap, then fresh data replaces it

// Switch tab at once (with what it showed last time), then fetch it fresh in the background.
function showTab(t) {
  tab = t; view = null; err = "";
  extra = cache[t] ?? null;
  draw();
  const path = { farms: "today", board: "board", top: "leaderboard", ledger: "ledger" }[t];
  api("GET", path).then((d) => {
    if (t === "farms") me = d; else cache[t] = d;
    if (tab === t && !view) { extra = cache[t] ?? null; draw(); }
  }).catch((e) => { err = e.message; draw(); });
}

// The header (aura) and your farms list, refreshed in the background after an action. During the reveal only the
// header is redrawn, so the reveal isn't cut short.
function refreshMe() {
  api("GET", "today").then((d) => {
    me = d;
    if (!revealing()) return draw();
    const h = $app.querySelector("header");
    if (h) h.outerHTML = header();
  }).catch(() => {});
}

let shownFarm = null, scrollTop = false;   // the farm on screen: opening a different one starts at its top, with its panels rolled up
function draw() {
  const farmKey = view ? (view.you ? "you" : "f" + view.id) : null;
  if (farmKey !== shownFarm) { shownFarm = farmKey; openBoxes.clear(); if (farmKey) scrollTop = true; }
  const body = view?.you ? youScreen() : view ? farmScreen(view)
    : tab === "farms" ? farmsTab() : !extra ? `<div class="panel"><p class="small">Loading…</p></div>` : tab === "board" ? boardTab(extra) : tab === "top" ? boardOfDay(extra) : ledgerTab(extra);
  $app.innerHTML = header() + body + `<div class="err">${esc(err)}</div><p class="small" style="text-align:center;color:var(--dim)">v${VERSION}</p>`;
  $tabs.innerHTML = [["farms", "🏠", "Home"], ["board", "🌾", "The Farm"], ["top", "🏆", "Today"], ["ledger", "📜", "Ledger"]]
    .map(([k, i, w]) => `<button class="tab${!view && tab === k ? " on" : ""}" data-tab="${k}" type="button"><span class="ti">${i}</span>${w}</button>`).join("");
  syncAddress();
  if (scrollTop) { scrollTop = false; window.scrollTo(0, 0); }
  if (flexed && view?.styles) { flexed = false; reveal($app.querySelector(".duel"), view); }
}

async function loadToday() { me = await api("GET", "today"); }
// Opening a farm from a tap puts its address (?farm=N) in the bar as a new history step, so it can be copied, and
// the browser's back button leaves it. A ?farm=N link, or the browser going back or forward to one, opens it in place.
async function openFarm(id, step = true) {
  view = await api("GET", "farm?id=" + id);
  pick = null;
  if (step && location.search !== "?farm=" + id) history.pushState({ farm: id }, "", "?farm=" + id);
}
// The address follows the screen: a farm shows ?farm=N, The Farm / Today / Ledger show ?tab=..., Home the bare address (so a reload stays where you were).
function syncAddress() {
  const want = view && !view.you ? "?farm=" + view.id : !view && tab !== "farms" ? "?tab=" + tab : "";
  if (location.search !== want) history.replaceState(null, "", location.pathname + want);
}

// back from a farm we stepped into goes back a history step (the same as the browser's back); from a ?farm=N link, home
const goBack = () => (history.state?.farm ? history.back() : showTab(tab));

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-act]");
  // the finished results card: once the reveal is over, a tap anywhere on it goes back
  if (!t && e.target.closest(".duel") && !revealing()) return goBack();
  if (!t) return;
  if (t.dataset.tab) return showTab(t.dataset.tab);
  const [act, arg] = t.dataset.act.split(":");
  if (act === "pick") { pick = pick === arg ? null : arg; return draw(); }
  if (act === "back") return goBack();
  if (act === "open" || act === "look") return run(() => openFarm(Number(arg)));
  if (act === "farm") return run(async () => { await api("POST", "farm", { style: pick }); pick = null; refreshMe(); });
  if (act === "take") return run(async () => { view = await api("POST", "take", { id: view.id, style: pick }); flexed = true; pick = null; refreshMe(); });
  if (act === "you") { note = ""; return run(openYou); }
  if (act === "pics") { picking = !picking; return draw(); }
  if (act === "setpic") return run(async () => { const { pic: p } = await api("POST", "pic", { pic: arg }); acct.pic = p; if (me) me.pic = p; picking = false; note = ""; });
  if (act === "rename") return run(async () => { note = "You're " + (await api("POST", "name", {})).name + " now."; await loadToday(); acct = await api("GET", "account"); });

  if (act === "newcode") return run(async () => { newCode = (await api("POST", "codes", { action: "new" })).code; acct = await api("GET", "account"); await loadToday(); });
  if (act === "copycode") return navigator.clipboard?.writeText(newCode).then(() => { note = "Copied."; draw(); }, () => {});
  if (act === "savecode") return downloadCode();
  if (act === "codedone") { newCode = null; note = "Save code made."; return draw(); }
  if (act === "forgetcode" || act === "forgetkey") {
    ask = { act, arg, text: act === "forgetcode" ? "Forget this save code? It stops working everywhere." : "Remove this passkey? It stops working everywhere." };
    note = ""; return draw();
  }
  if (act === "no") { ask = null; return draw(); }
  if (act === "yes" && ask?.act === "forgetcode") return run(async () => { const id = Number(ask.arg); ask = null; await api("POST", "codes", { action: "remove", id }); acct = await api("GET", "account"); note = "Save code forgotten."; });
  if (act === "yes" && ask?.act === "forgetkey") return run(async () => { const id = Number(ask.arg); ask = null; await api("POST", "passkey", { action: "remove", id }); acct = await api("GET", "account"); note = "Passkey removed."; });
  if (act === "addkey") return run(addPasskey);
  if (act === "loadkey") return run(loadWithPasskey);
  if (act === "loadcode") {
    const code = document.getElementById("code")?.value || "";
    return run(async () => { const d = await api("POST", "load", { code }); await loggedIn(d.name); });
  }
  if (act === "logout") {
    ask = null;
    return run(async () => { await api("POST", "logout", {}); await loadToday(); acct = await api("GET", "account"); note = "Logged out."; });
  }
});

// aura.88x31.app/?farm=16 opens that farm (the shared registry links its Aura Farm entries here)
const linked = Number(new URLSearchParams(location.search).get("farm"));
run(async () => { await loadToday(); if (linked > 0) await openFarm(linked, false); });
const wanted = new URLSearchParams(location.search).get("tab");
if (!(linked > 0) && ["board", "top", "ledger"].includes(wanted)) showTab(wanted);   // a reload comes back to the same tab
// the browser's back and forward buttons: a ?farm=N step opens that farm, the bare address shows the tab you were on
addEventListener("popstate", () => {
  const id = Number(new URLSearchParams(location.search).get("farm"));
  if (id > 0) run(() => openFarm(id, false)); else showTab(tab);
});
