// The page: talks to /api/*, draws the aura-glow screens. The rules come from engine/aura.js (the Worker uses the same file).
import * as A from "./engine/aura.js";
import { VERSION } from "./engine/version.js";

const COLOR = { D: "var(--D)", R: "var(--H)", M: "var(--S)" };
const $app = document.getElementById("app"), $tabs = document.getElementById("tabs");

let tab = "farms", me = null, view = null, pick = null, err = "";
let acct = null, newCode = null, note = "";   // the "you" screen: account, a just-made save code, a line of news

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

// A style: its name, a big emoji and what it beats. A button to tap when `tap` is set (`on` marks the one picked),
// otherwise just shown.
function style(s, { tap = false, on = false } = {}) {
  const tag = tap ? "button" : "div", attrs = tap ? ` data-act="pick:${s}" type="button"` : "";
  return `<${tag} class="card${on ? " on" : ""}" style="--c: ${COLOR[s]}"${attrs} aria-label="${A.STYLE[s]}">
    <span class="r">${A.STYLE[s]}</span><span class="e">${A.EMOJI[s]}</span><span class="s">beats ${A.EMOJI[A.BEATS[s]]}</span></${tag}>`;
}
const styles = () => `<div class="cards">${A.STYLES.map((s) => style(s, { tap: true, on: pick === s })).join("")}</div>`;
const shown = (s) => `<div class="cards">${style(s, { on: true })}</div>`;

// the emoji for a style or a card code from a duel before v0.6 ("D3" is DRIP, "X1" the CAP; older codes show as text)
const emo = (s) => (s == null ? "❔" : s[0] === "X" ? "🤫" : A.EMOJI[s[0]] ?? s);

// A player's record: their latest styles, newest first, as emoji.
const recordLine = (rec) => (rec && rec.length ? rec.map(emo).join(" ") : "no flexes yet");

const halo = (emoji, glow = 18) => `<div class="halo" style="box-shadow: 0 0 ${glow}px ${Math.round(glow / 4)}px rgba(255,111,207,.55)">${emoji}</div>`;

// ---------- screens ----------

function header() {
  return `<header>
    <div class="title">AURA FARMING SIMULATOR<small>NO CAP BATTLE EDITION 2027</small></div>
    <div class="me"><button class="link" data-act="you" type="button">${me?.name ? esc(me.name) : "log in"}</button><br>
      ${me?.aura != null ? `<b>${num(me.aura)}</b> aura today<br>👀 VIBES ${me.vibes}` : "stand there. look cool."}</div>
  </header>`;
}

function farmsTab() {
  const list = (me?.farms || []).map((d) => `
    <button class="item" data-act="open:${d.id}" type="button">
      <span class="grow"><b>${d.status === "open" ? "Farming" : d.status === "expired" ? "Your time is up" : "vs " + esc(d.opponent || "?")}</b><br>
      <span class="small">${d.status === "done" ? esc(d.caption) : d.status === "open" ? "1,000 aura an hour until someone takes it" : "nobody took it"}</span></span>
      <span>${d.style ? emo(d.style) : ""} ›</span>
    </button>`).join("");
  return `<div class="panel"><div class="big glow">AURA FARM</div>
      <p class="small">Pick a style and put it on the board, sealed. While it stands untaken you farm 1,000 aura an hour. Whoever takes it
      picks their own: the style that beats the other wins 10,000. Up to 3 a day.</p></div>
    ${styles()}
    <button class="go" data-act="farm" type="button" ${pick ? "" : "disabled"}>🌾 AURA FARM</button>
    <div class="list">${list || `<p class="small">No farms yet today.</p>`}</div>`;
}

function boardTab(b) {
  const rows = (b?.farms || []).map((c) => `
    <button class="item" data-act="${c.mine ? "open" : "look"}:${c.id}" type="button">
      ${halo("😎")}<span class="grow"><b>${esc(c.name)}</b><br><span class="small">${num(c.aura)} aura today${c.mine ? " · yours" : ""}</span><br>
      <span class="small">${recordLine(c.record)}</span></span>
      <span class="meme glow">${c.mine ? "FARMING" : "STARE DOWN ›"}</span></button>`).join("");
  return `<div class="panel"><div class="big glow">The board</div><p class="small">Open farms. Their style is sealed, but every style a player has played is public: read their record.</p></div>
    <div class="list">${rows || `<p class="small">Nobody is farming right now.</p>`}</div>`;
}

function boardOfDay(lb) {
  const rows = (lb?.rows || []).map((r, i) => `<div class="item"><span class="meme" style="width:28px">${i + 1}</span>
    <span class="grow">${esc(r.name)}</span><b class="glow">${num(r.aura)}</b></div>`).join("");
  return `<div class="panel"><div class="big glow">Most aura today</div><p class="small">Net aura: wins, losses and farming. Resets at midnight UTC.</p></div>
    <div class="list">${rows || `<p class="small">Nobody has any aura yet. Go farm.</p>`}</div>`;
}

function ledgerTab(l) {
  const rows = (l?.entries || []).map((e) => {
    const r = e.record;
    const [title, line] = r.styles
      ? [`FARM #${r.farm} · ${esc(r.caption[r.winner ?? 0])}`, r.styles.map(emo).join(" vs ")]
      // a card duel from before v0.6, as it was sealed
      : [`DUEL #${r.duel} · ${esc(r.caption[r.winner ?? 0])}`, (r.lineups ?? r.flipped ?? []).map((l) => [0, 1, 2].map((i) => emo(l[i])).join("")).join(" vs ") + (r.won ? ` · ${r.won[0]}-${r.won[1]}` : "")];
    return `<div class="item entry"><span class="grow"><span class="meme glow">${title}</span><br>
      <span class="small">${line}</span><br><code>${e.hash.slice(0, 16)}…</code></span></div>`;
  }).join("");
  return `<div class="panel"><div class="big glow">The ledger</div><p class="small">Every finished farm, sealed in a hash chain. Each style is sealed by a fingerprint when it goes up, and revealed when the farm is taken.</p></div>
    <div class="list">${rows || `<p class="small">No farms finished yet.</p>`}</div>`;
}

function farmScreen(v) {
  const back = `<button class="link" data-act="back" type="button">back</button>`;
  if (v.status === "open" && v.side !== 0) {
    const peek = v.peek ? `<p class="small">👀 It's not ${A.label(v.peek)}.</p>`
      : v.vibes > 0 ? `<button class="chip" data-act="peek" type="button">👀 Peek: one style it isn't (VIBES ${v.vibes})</button>`
      : `<p class="small">👀 No VIBES left today. Losing a farm earns one.</p>`;
    return `<div class="row">${halo("😎")}<div class="grow"><b class="glow">${esc(v.names[0])}</b><br>
        <span class="small">${recordLine(v.records[0])}</span></div></div>
      <div class="panel"><p class="small">Their style is sealed. Pick yours: if it beats theirs you win 10,000, if theirs beats yours you lose 10,000, and the
        same style is a draw.</p>${peek}</div>
      ${styles()}
      <button class="go" data-act="take" type="button" ${pick ? "" : "disabled"}>😤 STARE DOWN</button>${back}`;
  }
  if (v.status === "open" || v.status === "expired") {
    return `<div class="panel"><div class="big glow">${v.status === "open" ? "Farming" : "Your time is up"}</div>
      <p class="small">${v.status === "open" ? "1,000 aura an hour until someone takes it." : "Nobody took it before the daily reset."}</p></div>
      ${v.mine ? `<div class="small">Your style (only you can see it)</div>${shown(v.mine)}` : ""}${back}`;
  }
  // done: both styles, revealed (a card duel from before v0.6 shows its cards as emoji)
  const side = v.side >= 0 ? v.side : 1, other = 1 - side, d = v.result.deltas[side];
  const hand = (i) => (v.styles ? shown(v.styles[i]) : `<div class="small">${(v.cards?.[i] || []).map(emo).join(" ")}</div>`);
  return `
    <div class="row">${halo("😎")}<div class="grow"><b class="glow">${esc(v.names[other] || "?")}</b><br><span class="small">${recordLine(v.records[other])}</span></div>
      <div class="small" style="text-align:right">Farm #${v.id}</div></div>
    ${hand(other)}
    <div class="row">${halo("🧍", d > 0 ? 30 : 12)}<div class="grow"><b>you</b></div></div>
    ${hand(side)}
    <div class="cap" style="color:${d > 0 ? "#ff6fcf" : "#d6cfee"}">${esc(v.captions[side])}</div>${back}`;
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
  return `<div class="panel"><div class="big glow">${a.name ? esc(a.name) : "You"}</div>
      <p class="small">${a.player ? `On ${a.devices} browser${a.devices === 1 ? "" : "s"} or device${a.devices === 1 ? "" : "s"}. ` : ""}A save code or passkey lets you log in as this player anywhere. They work in the other 88x31 games too.</p>
      ${a.player ? `<button class="link" data-act="rename" type="button">🎲 reroll name</button>` : ""}</div>
    <div class="list">${ways || `<p class="small">No save codes or passkeys yet.</p>`}</div>
    <div class="row"><button class="chip" data-act="newcode" type="button">🔑 New save code</button>
      ${pkSupported() ? `<button class="chip" data-act="addkey" type="button">👆 Add a passkey</button>` : ""}</div>
    <div class="panel"><div class="small">Log in as another player</div>
      <div class="row" style="margin-top:8px"><input id="code" class="chip grow" placeholder="SAVE-CODE" autocomplete="off" spellcheck="false" style="color:var(--ink)">
        <button class="chip" data-act="loadcode" type="button">Log in</button></div>
      ${pkSupported() ? `<button class="link" data-act="loadkey" type="button" style="margin-top:8px">or log in with a passkey</button>` : ""}</div>
    ${a.player && hasWay ? `<button class="link" data-act="logout" type="button">log out of this browser</button>` : ""}
    <p class="small" style="text-align:center">${esc(note)}</p>
    <button class="link" data-act="back" type="button">back</button>`;
}

async function openYou() { view = { you: true }; newCode = null; acct = await api("GET", "account"); }

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

// The header (aura, VIBES) and your farms list, refreshed in the background after an action.
function refreshMe() { api("GET", "today").then((d) => { me = d; draw(); }).catch(() => {}); }

function draw() {
  const body = view?.you ? youScreen() : view ? farmScreen(view)
    : tab === "farms" ? farmsTab() : !extra ? `<div class="panel"><p class="small">Loading…</p></div>` : tab === "board" ? boardTab(extra) : tab === "top" ? boardOfDay(extra) : ledgerTab(extra);
  $app.innerHTML = header() + body + `<div class="err">${esc(err)}</div><p class="small" style="text-align:center;color:var(--dim)">v${VERSION}</p>`;
  $tabs.innerHTML = [["farms", "🌾 Farm"], ["board", "🧍 Board"], ["top", "🏆 Today"], ["ledger", "📜 Ledger"]]
    .map(([k, w]) => `<button class="tab${!view && tab === k ? " on" : ""}" data-tab="${k}" type="button">${w}</button>`).join("");
}

async function loadToday() { me = await api("GET", "today"); }
async function openFarm(id) {
  view = await api("GET", "farm?id=" + id);
  pick = null;
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-act]");
  if (!t) return;
  if (t.dataset.tab) return showTab(t.dataset.tab);
  const [act, arg] = t.dataset.act.split(":");
  if (act === "pick") { pick = pick === arg ? null : arg; return draw(); }
  if (act === "back") return showTab(tab);
  if (act === "open" || act === "look") return run(() => openFarm(Number(arg)));
  if (act === "farm") return run(async () => { view = await api("POST", "farm", { style: pick }); pick = null; refreshMe(); });
  if (act === "take") return run(async () => { view = await api("POST", "take", { id: view.id, style: pick }); pick = null; refreshMe(); });
  if (act === "peek") return run(async () => { view = await api("POST", "vibes", { id: view.id }); refreshMe(); });
  if (act === "you") { note = ""; return run(openYou); }
  if (act === "rename") return run(async () => { note = "You're " + (await api("POST", "name", {})).name + " now."; await loadToday(); acct = await api("GET", "account"); });

  if (act === "newcode") return run(async () => { newCode = (await api("POST", "codes", { action: "new" })).code; acct = await api("GET", "account"); await loadToday(); });
  if (act === "copycode") return navigator.clipboard?.writeText(newCode).then(() => { note = "Copied."; draw(); }, () => {});
  if (act === "savecode") return downloadCode();
  if (act === "codedone") { newCode = null; note = "Save code made."; return draw(); }
  if (act === "forgetcode" && confirm("Forget this save code? It stops working everywhere.")) return run(async () => { await api("POST", "codes", { action: "remove", id: Number(arg) }); acct = await api("GET", "account"); note = "Save code forgotten."; });
  if (act === "forgetkey" && confirm("Remove this passkey? It stops working everywhere.")) return run(async () => { await api("POST", "passkey", { action: "remove", id: Number(arg) }); acct = await api("GET", "account"); note = "Passkey removed."; });
  if (act === "addkey") return run(addPasskey);
  if (act === "loadkey") return run(loadWithPasskey);
  if (act === "loadcode") {
    const code = document.getElementById("code")?.value || "";
    return run(async () => { const d = await api("POST", "load", { code }); await loggedIn(d.name); });
  }
  if (act === "logout" && confirm("Log out of this browser? Log back in any time with your save code or passkey.")) {
    return run(async () => { await api("POST", "logout", {}); await loadToday(); acct = await api("GET", "account"); note = "Logged out."; });
  }
});

run(loadToday);
