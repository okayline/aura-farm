// The reveal, right after you FLEX (v0.9). Their card starts face down and flips over, then the winning emoji does its
// thing to the losing one: DRIP rains diamonds on RIZZ, RIZZ grows and MOG crumbles, MOG leans in and DRIP crumbles,
// and a draw just sparkles on each side. Then the loser drains to black and white, and the line and the caption drop in a
// sentence at a time, one beat apart. Mocked up and agreed: https://claude.ai/artifact/WM4HGFmPJ1cDaf184WeKAn
// Phones set to reduce motion get the same beats with fades only: no flip, no flying emoji, no stamping.
import { BEATS } from "./engine/aura.js";

const PACE = 1.25;   // every time below, stretched: the agreed version is 20% slower than the first mockup
const rnd = (a, b) => a + Math.random() * (b - a);
let run = null;      // the reveal playing now; a newer one (or leaving the screen) stops the older one's timers

export const revealing = () => !!run && document.contains(run.el);

// el: the .duel element farmScreen drew with the reveal markup (their face first, yours second). v: the farm.
export function reveal(el, v) {
  const mine = run = { el };
  const at = (ms, fn) => setTimeout(() => run === mine && document.contains(el) && fn(), ms * PACE);
  const anim = (node, frames, o) => node.animate(frames, { ...o, duration: o.duration * PACE, delay: (o.delay || 0) * PACE });
  const [them, you] = el.querySelectorAll(".face"), bits = [...el.querySelectorAll(".cap .bit")];
  const winner = v.result.winner, other = 1 - (v.side >= 0 ? v.side : 1);
  const winFace = winner == null ? null : winner === other ? them : you, loseFace = winner == null ? null : winFace === them ? you : them;
  const end = () => { loseFace?.classList.add("lost"); el.querySelector(".back")?.remove(); el.parentNode?.querySelector(".detail.wait")?.classList.remove("wait"); if (run === mine) run = null; };   // the finished screen, as drawn without the reveal
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 3. back to the real cards: the loser drains, the winner glows, then the line, a beat, AURA FARMED., a beat, +100,000 aura.
  // cleanup puts the page back after the emoji layer. Reduce-motion players get the same beats with fades only.
  const settle = (done, cleanup) => {
    at(done, () => {
      cleanup();
      if (!loseFace) return;
      anim(loseFace, [{ filter: "grayscale(0)", opacity: 1 }, { filter: "grayscale(1)", opacity: .6 }], { duration: 600 });
      loseFace.classList.add("lost");
      anim(winFace.querySelector(".card.on"), [{ boxShadow: "0 0 26px var(--c)" }, { boxShadow: "0 0 60px 12px var(--c)" }, { boxShadow: "0 0 26px var(--c)" }], { duration: 900 });
    });
    // a beat between pieces, and two after the whole line
    let when = done + 400;
    const times = bits.map((b, i) => (when += i === 0 ? 0 : b.parentNode !== bits[i - 1].parentNode ? 1600 : 800));
    bits.forEach((b, i) => at(times[i], () => {
      b.style.opacity = "";   // each one stamps down, with only a tiny bounce
      anim(b, calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "scale(1.6)", opacity: 0, easing: "ease-in" }, { transform: "scale(.96)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 350 });
      if (i === bits.length - 1) end();
    }));
    at(when + 800, cleanup);
  };

  // 1. their card face down, a wobble, then the flip. Reduce-motion players get the card fading over instead, then the same beats.
  for (const b of bits) b.style.opacity = 0;
  if (calm) {
    anim(them.querySelector(".back"), [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 800, fill: "both" });
    return settle(1800, () => {});
  }
  anim(them.querySelector(".slot"), [{ rotate: "0deg" }, { rotate: "-3deg" }, { rotate: "3deg" }, { rotate: "0deg" }], { duration: 600, delay: 100 });
  anim(them.querySelector(".back"), [{ transform: "rotateY(0)" }, { transform: "rotateY(180deg)" }], { duration: 500, delay: 800, easing: "ease-in", fill: "both" });
  anim(them.querySelector(".slot .card.on"), [{ transform: "rotateY(-180deg)" }, { transform: "rotateY(0)" }], { duration: 500, delay: 800, easing: "ease-out", fill: "both" });

  // 2. the emoji interaction, played by copies of the two emoji in a layer above everything
  at(1500, () => {
    const fx = document.createElement("div"); fx.className = "fx"; document.body.append(fx);
    const pos = (n) => { const r = n.getBoundingClientRect(), pad = parseFloat(getComputedStyle(n).paddingBottom) || 0; return { x: r.left + r.width / 2, y: r.top + (r.height - pad) / 2 }; };   // the emoji's own centre, not the centre of the empty line under it, so its copy starts exactly where it sat
    const spawn = (text, p, size = 40, cls = "") => {
      const d = document.createElement("div"); d.textContent = text; d.className = cls;
      d.style.cssText = `left:${p.x}px;top:${p.y}px;font-size:${size}px`; fx.append(d); return d;
    };
    const wSpan = (winFace || you).querySelector(".e"), lSpan = (loseFace || them).querySelector(".e");
    const W = pos(wSpan), L = pos(lSpan), dx = L.x - W.x, dy = L.y - W.y;
    const w = spawn(wSpan.textContent, W), l = spawn(lSpan.textContent, L);
    wSpan.style.visibility = lSpan.style.visibility = "hidden";
    const shake = (node, ms, delay, amp) => anim(node, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ transform: `translateX(${i % 2 ? amp : -amp}px)` })).concat({ transform: "none" }), { duration: ms, delay });
    // the loser falls apart: it sinks and fades while bits of it drop away
    const crumble = (delay, bit, cls = "") => {
      anim(l, [{ transform: "none", opacity: 1 }, { transform: "translateY(18px) scale(.6) rotate(8deg)", opacity: 0 }], { duration: 450, delay, easing: "ease-in", fill: "forwards" });
      for (let i = 0; i < 9; i++) anim(spawn(bit, { x: L.x + rnd(-14, 14), y: L.y + rnd(-10, 10) }, rnd(9, 14), cls),
        [{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${rnd(-40, 40)}px, ${rnd(45, 75)}px) rotate(${rnd(-200, 200)}deg)`, opacity: 0 }],
        { duration: 750, delay: delay + rnd(0, 120), easing: "cubic-bezier(.3,0,.8,.6)", fill: "both" });
    };
    // two sparkles: one up and to the right of the emoji, a smaller one down and to the left
    const sparkle = (P, delay) => [[30, -24, 26], [-28, 20, 18]].forEach(([x, y, size], i) => anim(spawn("✨", { x: P.x + x, y: P.y + y }, size),
      [{ transform: "scale(0) rotate(0)", opacity: 0 }, { transform: "scale(1.2) rotate(40deg)", opacity: 1, offset: .4 }, { transform: "scale(.6) rotate(90deg)", opacity: 0 }],
      { duration: 900, delay: delay + i * 180, fill: "both" }));
    const win = winner == null ? null : v.styles[winner];
    let done;
    if (win === "D") {
      // diamonds rain down on RIZZ, which flinches
      anim(w, [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 450 });
      for (let i = 0; i < 16; i++) anim(spawn("💎", { x: L.x + rnd(-62, 62), y: L.y - 150 }, rnd(16, 26)),
        [{ transform: "translateY(0)", opacity: 0 }, { opacity: 1, offset: .2 }, { transform: `translateY(${150 + rnd(-6, 26)}px)`, opacity: 1, offset: .85 }, { transform: `translateY(${150 + rnd(10, 30)}px)`, opacity: 0 }],
        { duration: 650, delay: 200 + i * 55, easing: "ease-in", fill: "both" });
      shake(l, 700, 650, 3);
      anim(l, [{ transform: "scale(1)" }, { transform: "scale(.85)" }, { transform: "scale(.85)" }, { transform: "scale(1)" }], { duration: 900, delay: 600 });
      done = 1600;
    } else if (win === "R") {
      // RIZZ grows and sways; MOG sits there, then shakes and crumbles
      anim(w, [{ transform: "scale(1) rotate(0)" }, { transform: "scale(1.45) rotate(-8deg)", offset: .25 }, { transform: "scale(1.45) rotate(8deg)", offset: .5 },
        { transform: "scale(1.45) rotate(-8deg)", offset: .75 }, { transform: "scale(1) rotate(0)" }], { duration: 1400, easing: "ease-in-out" });
      shake(l, 600, 1100, 3);
      crumble(1700, "🪨");
      done = 2500;
    } else if (win === "M") {
      // MOG leans in, gets big and holds still; DRIP crumbles
      const lean = `translate(${dx * .06}px, ${dy * .06}px) scale(1.25)`;   // just a little lean
      anim(w, [{ transform: "none" }, { transform: lean }], { duration: 500, easing: "ease-out", fill: "forwards" });
      crumble(1100, "◆", "shard");
      at(1900, () => anim(w, [{ transform: lean }, { transform: "none" }], { duration: 300, easing: "ease-in", fill: "forwards" }));
      done = 2200;
    } else {
      // the same style: their side sparkles, then yours
      sparkle(L, 0); sparkle(W, 900);
      done = 1800;
    }

    settle(done, () => { fx.remove(); wSpan.style.visibility = lSpan.style.visibility = ""; });
  });
}
