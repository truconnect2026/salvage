/*
 * change 43a: the owner's phone, gates 226-229; change 43a.1: 230-231.  Run by scripts/gate.mjs
 * after its own browser block, or alone:
 *
 *   NODE_PATH=<playwright>/node_modules node scripts/gate-owner.mjs <baseUrl>
 *
 * Section 1's device is the OWNER's phone now: it rings six times, and the
 * owner can slide to answer, decline, or let it ring out.  Rendered state is
 * the only truth: the knob's transform, the call path the engine publishes
 * on [data-demo] (data-call-path / data-call-how / data-t-real), the stake
 * figure's text and colour, the lock-screen notes' boxes.  Expectations come
 * from lib/client.config.ts; the beat coordinates are held HERE, not read
 * from lib/timeline.ts — a gate that imported the timeline would move with
 * it and could never catch a rebeat.
 *
 * Every gate runs in Chromium AND WebKit at the v2 set: 390x700, 390x844,
 * 1440x900 play the call; at 844x390 the change-41 orientation guard covers
 * the app, so the gate asserts the call never starts there.  A missing
 * WebKit is red unless GATE_ALLOW_NO_WEBKIT=1.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const V2 = [
  { width: 390, height: 700 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];
/* Held independently of lib/timeline.ts (see above). */
const RING_OUT = 7.2; // six rings, 1.2s apart, from 0.2 — the miss lands at 7.2
const SETTLED = 13.8; // the story clock's loop end

/* The slide-to-answer spring, closed form (DESIGN.md: k 420, c 34, m 1),
   released from rest at x0: underdamped, it would cross 0 near 0.2s — the
   track's hard stop holds it there. */
const SPRING_K = 420;
const SPRING_C = 34;
const springX = (x0, t) => {
  if (t <= 0) return x0;
  const w0 = Math.sqrt(SPRING_K);
  const z = SPRING_C / (2 * w0);
  const wd = w0 * Math.sqrt(1 - z * z);
  const x = x0 * Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  return x < 0 ? 0 : x;
};

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const EMBER = "rgb(196, 120, 90)";

function expectations(src) {
  const id = src.match(/export const DEFAULT_PRESET = "([^"]+)"/)?.[1];
  if (!id) throw new Error("gate-owner setup: no DEFAULT_PRESET");
  const at = src.indexOf(`id: "${id}"`);
  const next = src.indexOf('id: "', at + 5);
  const block = src.slice(at, next < 0 ? src.length : next);
  const pick = (re, label) => {
    const m = block.match(re);
    if (!m) throw new Error(`gate-owner setup: could not read ${label} for preset "${id}"`);
    return m[1];
  };
  const need = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`gate-owner setup: could not read ${label} from lib/client.config.ts`);
    return m[1];
  };
  const caught = [...block.matchAll(/\{\s*name:\s*"([^"]+)",\s*number:\s*"[^"]+",\s*detail:\s*"([^"]+)",\s*amount:\s*(\d+)/g)].map((m) => ({
    name: m[1],
    detail: m[2],
    amount: Number(m[3]),
  }));
  if (caught.length < 2) throw new Error(`gate-owner setup: preset "${id}" needs two caught entries`);
  return {
    id,
    lost: Number(pick(/lost:\s*(\d+)/, "lost")),
    ticket: Number(pick(/ticket:\s*(\d+)/, "ticket")),
    customerName: pick(/customerName:\s*"([^"]+)"/, "customerName"),
    caught,
    perJob: need(/rows:\s*\{\s*ticket:\s*"([^"]+)"/, "COPY.yours.rows.ticket"),
    onAJob: need(/onAJob:\s*"([^"]+)"/, "COPY.call.onAJob"),
    slideToAnswer: need(/slideToAnswer:\s*"([^"]+)"/, "COPY.call.slideToAnswer"),
    stampLabel: need(/stamp:\s*"([^"]+)"/, "COPY.ledger.stamp"),
  };
}

export async function runOwnerGates({ base, pw, check }) {
  const X = expectations(readFileSync(join(ROOT, "lib", "client.config.ts"), "utf8"));
  const allowNoWebkit = process.env.GATE_ALLOW_NO_WEBKIT === "1";
  const engines = [];
  let wkError = null;
  for (const name of ["chromium", "webkit"]) {
    try {
      engines.push({ name, browser: await pw[name].launch() });
    } catch (err) {
      if (name === "webkit") wkError = String(err.message).split("\n")[0].slice(0, 120);
      else throw err;
    }
  }
  const noWk = wkError ? (allowNoWebkit ? " [WebKit NOT RUN: GATE_ALLOW_NO_WEBKIT=1]" : "") : "";
  const ctxFor = (browser, vp, eng, extra = {}) =>
    browser.newContext({
      viewport: vp,
      hasTouch: vp.width < 1100,
      ...(eng === "chromium" && vp.width < 1100 ? { isMobile: true } : {}),
      ...extra,
    });

  /* OWNER_ONLY=226 runs just those gates — mutation proofs from the
     standalone entry only; scripts/gate.mjs never sets it. */
  const only = (process.env.OWNER_ONLY ?? "").split(",").map(Number).filter(Boolean);
  const gate = async (n, name, fn) => {
    if (only.length && !only.includes(n)) return;
    const notes = [];
    let ok = true;
    for (const { name: eng, browser } of engines) {
      for (const vp of V2) {
        try {
          const r = vp.width === 844 ? await guarded(browser, vp, eng) : await fn(browser, vp, eng);
          ok &&= r.ok;
          notes.push(`${eng}@${vp.width}x${vp.height} ${r.ok ? "ok" : "RED"}: ${r.detail}`);
        } catch (err) {
          ok = false;
          notes.push(`${eng}@${vp.width}x${vp.height} THREW: ${String(err.message).split("\n")[0].slice(0, 160)}`);
        }
      }
    }
    if (wkError && !allowNoWebkit) {
      ok = false;
      notes.push(`WebKit unavailable: ${wkError}`);
    }
    check(n, name, ok, notes.join(" | ") + noWk);
  };

  /* 844x390: the orientation guard is up, the app is display:none, and the
     phone never rings — the clock stays parked at 0 for 2.5s. */
  const guarded = async (browser, vp, eng) => {
    const ctx = await ctxFor(browser, vp, eng);
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("[data-demo]")?.dataset.t !== "settled", null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => ({
      guard: getComputedStyle(document.querySelector("[data-rotate-guard]")).display,
      app: getComputedStyle(document.querySelector("[data-app-root]")).display,
      t: document.querySelector("[data-demo]").dataset.t,
      path: document.querySelector("[data-demo]").dataset.callPath,
    }));
    await ctx.close();
    const ok = s.guard !== "none" && s.app === "none" && s.t === "0.000" && s.path === "ringing";
    return { ok, detail: `guard ${s.guard}, app ${s.app}, t ${s.t} after 2.5s (parked), path ${s.path}` };
  };

  const open = async (browser, vp, eng, extra, init) => {
    const ctx = await ctxFor(browser, vp, eng, extra);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    return { ctx, page };
  };
  const waitReal = (page, r) =>
    page.waitForFunction((x) => parseFloat(document.querySelector("[data-demo]")?.dataset.tReal ?? "") >= x, r, { timeout: 30000 });
  const waitStory = (page, t) =>
    page.waitForFunction((x) => parseFloat(document.querySelector("[data-demo]")?.dataset.t ?? "") >= x, t, { timeout: 40000 });
  const call = (page) =>
    page.evaluate(() => {
      const d = document.querySelector("[data-demo]").dataset;
      const knob = document.querySelector("[data-owner-knob]");
      const m = /translateX\((-?[\d.]+)px\)/.exec(knob?.style.transform ?? "");
      return { path: d.callPath, how: d.callHow, real: +d.tReal, t: +d.t, x: m ? +m[1] : NaN };
    });
  /* The knob's travel in CLIENT px: the track less the knob and its 4px
     insets, scaled by the screen's own transform. */
  const geometry = (page) =>
    page.evaluate(() => {
      const knob = document.querySelector("[data-owner-knob]");
      const track = document.querySelector("[data-owner-track]");
      const kr = knob.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      const k = kr.width / knob.offsetWidth;
      return {
        cx: kr.left + kr.width / 2,
        cy: kr.top + kr.height / 2,
        travel: tr.width - kr.width - 8 * k,
        maxDesign: track.offsetWidth - knob.offsetWidth - 8,
      };
    });
  const drag = async (page, share) => {
    const g = await geometry(page);
    await page.mouse.move(g.cx, g.cy);
    await page.mouse.down();
    await page.mouse.move(g.cx + g.travel * share, g.cy, { steps: 8 });
    /* The handlers only write the drag position; the next frame paints it
       (one rAF owner) — read after two frames, never before. */
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const held = await call(page);
    await page.mouse.up();
    return { g, held };
  };

  /* ---- 226: slide to answer. A release at 40% springs home (the knob's
     x falls on the very next frames and reaches 0) and the phone is STILL
     ringing; a release at 90% answers: path "answered", how "swipe", the
     in-call layer up and the incoming layer gone. ---- */
  await gate(226, "43a: the owner's slide-to-answer — a 40% release springs home still ringing; >= 80% answers", async (browser, vp, eng) => {
    const { ctx, page } = await open(browser, vp, eng);
    await waitReal(page, 0.6);
    const a = await drag(page, 0.4);
    /* Every frame for 400ms after the release: the knob's x and the real
       clock it was painted on. */
    const trace = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const out = [];
          const t0 = performance.now();
          const step = () => {
            const d = document.querySelector("[data-demo]").dataset;
            const m = /translateX\((-?[\d.]+)px\)/.exec(document.querySelector("[data-owner-knob]").style.transform);
            out.push({ x: m ? +m[1] : NaN, real: +d.tReal });
            if (performance.now() - t0 < 400) requestAnimationFrame(step);
            else resolve(out);
          };
          requestAnimationFrame(step);
        }),
    );
    const after90 = { x: (trace.find((s) => s.real >= trace[0].real + 0.09) ?? trace[trace.length - 1]).x };
    await page.waitForTimeout(400);
    const after790 = await call(page);
    /* Fit the release time from the first sample still in flight, then
       every later in-flight sample must sit on the closed form (±2.5 design
       px — the engine integrates in 4ms steps). At least one predicted
       sample: headless WebKit paints a 1440 page at ~90ms a frame, so only
       two frames can land inside the ~250ms the spring takes to settle. */
    const x0 = a.held.x;
    const inFlight = trace.filter((s) => s.x > 0.5 && s.x < x0 - 0.5);
    let fit = { ok: false, worst: NaN, n: inFlight.length };
    if (inFlight.length >= 2) {
      const first = inFlight[0];
      let lo = 0;
      let hi = 0.25;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (springX(x0, mid) > first.x) lo = mid;
        else hi = mid;
      }
      const release = first.real - lo;
      const errs = inFlight.slice(1).map((s) => Math.abs(springX(x0, s.real - release) - s.x));
      const worst = Math.max(...errs);
      fit = { ok: worst <= 2.5, worst, n: inFlight.length };
    }
    const b = await drag(page, 0.9);
    await page.waitForTimeout(450);
    const ans = await call(page);
    const layers = await page.evaluate(() => ({
      incall: getComputedStyle(document.querySelector("[data-owner-incall]")).opacity,
      incoming: getComputedStyle(document.querySelector("[data-owner-incoming]")).visibility,
    }));
    await ctx.close();
    /* A real TOUCH drag (Chromium's CDP touch input) that STARTS ON THE
       TRACK, not the knob: it must answer, and the pager under it must not
       move — the thumb's path on a phone. */
    let touch = { ran: false };
    if (eng === "chromium" && vp.width < 1100) {
      const t = await open(browser, vp, eng);
      await waitReal(t.page, 0.6);
      const tg = await t.page.evaluate(() => {
        const tr = document.querySelector("[data-owner-track]").getBoundingClientRect();
        const kr = document.querySelector("[data-owner-knob]").getBoundingClientRect();
        return { x: kr.right + 6, y: tr.top + tr.height / 2, travel: tr.width - kr.width, pager: document.querySelector("[data-pager]").scrollTop };
      });
      const cdp = await t.ctx.newCDPSession(t.page);
      const pt = (x) => [{ x, y: tg.y, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(tg.x) });
      for (let i = 1; i <= 10; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(tg.x + (tg.travel * 0.95 * i) / 10) });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await t.page.waitForTimeout(400);
      const tc = await call(t.page);
      const pager = await t.page.evaluate(() => document.querySelector("[data-pager]").scrollTop);
      await t.ctx.close();
      touch = { ran: true, path: tc.path, how: tc.how, pagerMoved: pager - tg.pager };
    }
    const heldShare = a.held.x / a.g.maxDesign;
    const ok =
      heldShare > 0.3 &&
      heldShare < 0.5 &&
      a.held.path === "ringing" &&
      after90.x < a.held.x &&
      fit.ok &&
      after790.x === 0 &&
      after790.path === "ringing" &&
      b.held.x / b.g.maxDesign > 0.8 &&
      ans.path === "answered" &&
      ans.how === "swipe" &&
      layers.incall === "1" &&
      layers.incoming === "hidden" &&
      (!touch.ran || (touch.path === "answered" && touch.how === "swipe" && touch.pagerMoved === 0));
    return {
      ok,
      detail:
        `40% hold x=${a.held.x.toFixed(1)}/${a.g.maxDesign} (${(heldShare * 100).toFixed(0)}%) ${a.held.path}; ` +
        `+90ms x=${after90.x.toFixed(1)}; spring fit ${fit.n} in-flight frames, worst ${Number.isFinite(fit.worst) ? fit.worst.toFixed(2) : "?"}px vs k420/c34 (need <= 2.5); ` +
        `+800ms x=${after790.x} ${after790.path} (need 0, ringing); ` +
        `90% release -> ${ans.path}/${ans.how}, in-call opacity ${layers.incall}, incoming ${layers.incoming}` +
        (touch.ran ? `; TOUCH from the track -> ${touch.path}/${touch.how}, pager moved ${touch.pagerMoved}px (need 0)` : ""),
    };
  });

  /* ---- 227: the stake. It counts up while the phone rings (two samples,
     strictly rising, strictly between $0 and the stored lost figure), and at
     the miss it shows the stored figure EXACTLY and stays there — on the
     ring-out and on Decline alike — in ember. ---- */
  /* Amended (change 43a.1): the stake is ONE call — "Per job", the stored
     ticket — not the month (the monthly lost figure lives in section 2). */
  await gate(227, `43b: the stake ("${X.perJob}") counts up over the rings and freezes at preset.ticket (${usd(X.ticket)}) +/-0 at the miss, in ember — one stake per viewport, still there at settle; answered, the line leaves and the second call's stake freezes at the ticket too`, async (browser, vp, eng) => {
    /* EXACTLY one stake renders per viewport (mobile slot or desktop
       column), and its line is opaque. */
    const stake = (page) =>
      page.evaluate(() => {
        const shown = [...document.querySelectorAll("[data-stake-value]")].filter((e) => e.getClientRects().length > 0);
        const el = shown[0];
        if (!el) return null;
        let o = 1;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || "1");
        const label = el.parentElement?.firstElementChild?.textContent.trim() ?? null;
        return { text: el.textContent.trim(), color: getComputedStyle(el).color, count: shown.length, opacity: +o.toFixed(2), label };
      });
    const num = (s) => Number(String(s?.text ?? "").replace(/[^0-9]/g, ""));
    /* Ring-out. */
    const { ctx, page } = await open(browser, vp, eng);
    await waitReal(page, 2.0);
    const s1 = await stake(page);
    await waitReal(page, 4.5);
    const s2 = await stake(page);
    await page.waitForFunction(() => document.querySelector("[data-demo]")?.dataset.callPath === "missed", null, { timeout: 15000 });
    const atMiss = await stake(page);
    const missReal = (await call(page)).real;
    await page.waitForTimeout(1500);
    const later = await stake(page);
    await waitStory(page, SETTLED);
    await page.waitForTimeout(250);
    const settled = await stake(page);
    await ctx.close();
    /* Decline at ~1.5s: the whole stake is lost at once, and stays. */
    const d = await open(browser, vp, eng);
    await waitReal(d.page, 1.5);
    await d.page.click("[data-owner-decline]");
    await d.page.waitForTimeout(120);
    const dAt = await stake(d.page);
    const dPath = await call(d.page);
    await d.page.waitForTimeout(1500);
    const dLater = await stake(d.page);
    await d.ctx.close();
    /* Answered: the count stops at a figure nobody stored, so the whole
       line leaves — nothing computed rests on screen, nothing lost goes
       gray. */
    const w = await open(browser, vp, eng);
    await waitReal(w.page, 1.5);
    await drag(w.page, 0.95);
    await w.page.waitForTimeout(700);
    const wAt = await stake(w.page);
    const wPath = await call(w.page);
    /* ... and the second call, which the owner cannot take, rings out: its
       stake freezes at the ticket. */
    await w.page.waitForFunction(() => document.querySelector("[data-demo]")?.dataset.callSecond === "missed", null, { timeout: 25000 });
    await w.page.waitForTimeout(350);
    const w2 = await stake(w.page);
    await w.ctx.close();
    const want = usd(X.ticket);
    const ok =
      num(s1) > 0 &&
      num(s2) > num(s1) &&
      num(s2) < X.ticket &&
      s1?.label === X.perJob &&
      atMiss?.text === want &&
      later?.text === want &&
      missReal >= RING_OUT - 0.05 &&
      atMiss.color === EMBER &&
      dPath.path === "missed" &&
      dPath.how === "decline" &&
      dAt?.text === want &&
      dLater?.text === want &&
      dLater.color === EMBER &&
      [s1, s2, atMiss, later, settled, dAt, dLater].every((x) => x?.count === 1 && x.opacity === 1) &&
      settled?.text === want &&
      wPath.path === "answered" &&
      wAt?.opacity === 0 &&
      w2?.text === want &&
      w2.opacity === 1 &&
      w2.color === EMBER;
    return {
      ok,
      detail:
        `ringing ${s1?.text} -> ${s2?.text}; miss at real ${missReal.toFixed(2)} (need >= ${RING_OUT}) shows ${atMiss?.text}, +1.5s ${later?.text} (need ${want}) ${atMiss?.color}; ` +
        `decline -> ${dPath.path}/${dPath.how} ${dAt?.text}, +1.5s ${dLater?.text} ${dLater?.color}; ` +
        `settled ${settled?.text}; visible stakes ${[s1, s2, atMiss, later, settled].map((x) => x?.count).join("/")} (need 1 each); ` +
        `answered -> ${wPath.path}, stake line opacity ${wAt?.opacity} at +0.7s (need 0); second call rang out -> ${w2?.text} (need ${want}) opacity ${w2?.opacity}; label ${JSON.stringify(s1?.label)} (need ${JSON.stringify(X.perJob)})`,
    };
  });

  /* ---- 228: three paths, one ending. Swipe, Decline and the ring-out all
     land Missed call, Text sent and Booked (amended, change 43a.1: an
     answered call is followed by a second call that rings out), fill the
     rail and land the money; and once the story settles the engine STOPS
     — no rAF, no clock writes, for a full second. (Reduced motion moved to
     gate 231.) ---- */
  await gate(228, "43c: swipe, decline and ring-out all reach Booked — the answered path through a second call that rings out — and the phase engine stops after", async (browser, vp, eng) => {
    const SPY = () => {
      window.__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        window.__raf++;
        return orig(cb);
      };
      window.__buzz = [];
      if ("vibrate" in navigator) {
        navigator.vibrate = (p) => {
          window.__buzz.push(p);
          return true;
        };
      }
    };
    const end = async (page) =>
      page.evaluate(() => {
        const vis = (el) => !!el && el.getBoundingClientRect().height > 1 && getComputedStyle(el).visibility !== "hidden";
        const note = (k) => document.querySelector(`[data-owner-note="${k}"]`);
        const money = [...document.querySelectorAll("[data-beat-money]")].find((e) => e.getClientRects().length > 0);
        return {
          booked: vis(note("booked")) && getComputedStyle(note("booked").querySelector("[data-owner-note-card]")).opacity === "1",
          text: vis(note("text")),
          missed: vis(note("missed")),
          rail: [...document.querySelectorAll("[data-rail-fill]")].map((e) => e.style.transform),
          money: money ? getComputedStyle(money).opacity : null,
          incoming: getComputedStyle(document.querySelector("[data-owner-incoming]")).visibility,
        };
      });
    const runPath = async (kind) => {
      const { ctx, page } = await open(browser, vp, eng, {}, SPY);
      await waitReal(page, 1.0);
      if (kind === "decline") await page.click("[data-owner-decline]");
      if (kind === "swipe") await drag(page, 0.95);
      await waitStory(page, SETTLED);
      /* The frame that first shows >= 13.8 may already have queued the
         last one (its true t sat a hair under the bound): let it land. */
      await page.waitForTimeout(250);
      const c = await call(page);
      const e = await end(page);
      const before = await page.evaluate(() => ({ raf: window.__raf, t: document.querySelector("[data-demo]").dataset.t, r: document.querySelector("[data-demo]").dataset.tReal }));
      await page.waitForTimeout(1000);
      const after = await page.evaluate(() => ({ raf: window.__raf, t: document.querySelector("[data-demo]").dataset.t, r: document.querySelector("[data-demo]").dataset.tReal, buzz: window.__buzz, hasVibrate: "vibrate" in navigator }));
      await ctx.close();
      return { kind, c, e, stopped: after.raf === before.raf && after.t === before.t && after.r === before.r, rafs: after.raf - before.raf, buzz: after.buzz, hasVibrate: after.hasVibrate };
    };
    const runs = await Promise.all(["swipe", "decline", "timeout"].map(runPath));
    const want = { swipe: ["answered", "swipe"], decline: ["missed", "decline"], timeout: ["missed", "timeout"] };
    const bits = [];
    let ok = true;
    for (const r of runs) {
      const missedPath = true;
      const good =
        r.c.path === want[r.kind][0] &&
        r.c.how === want[r.kind][1] &&
        r.e.booked &&
        r.e.rail[2] === "scaleX(1)" &&
        r.e.money === "1" &&
        r.e.incoming === "hidden" &&
        r.e.missed === missedPath &&
        r.e.text === missedPath &&
        (missedPath ? r.e.rail[0] === "scaleX(1)" && r.e.rail[1] === "scaleX(1)" : r.e.rail[0] === "scaleX(0)" && r.e.rail[1] === "scaleX(0)") &&
        r.stopped;
      ok &&= good;
      bits.push(
        `${r.kind}: ${r.c.path}/${r.c.how}, booked ${r.e.booked}, missed ${r.e.missed}, text ${r.e.text}, rail ${r.e.rail.map((x) => x.replace(/scaleX\(|\)/g, "")).join("/")}, money ${r.e.money}, ` +
          `stopped ${r.stopped} (${r.rafs} rAF in 1s)${r.hasVibrate ? `, buzz ${JSON.stringify(r.buzz)}` : ""}`,
      );
    }
    /* Haptics where the engine has them (Chromium): the ring-out buzzes
       six rings, the miss, the booking — in that order; the decline path
       buzzes the miss and the booking and no ring after the decline. */
    const dec = runs.find((r) => r.kind === "decline");
    const out = runs.find((r) => r.kind === "timeout");
    if (dec.hasVibrate) {
      const J = (a) => JSON.stringify(a);
      const ringOut = J(out.buzz) === J([300, 300, 300, 300, 300, 300, [60, 80, 60], 30]);
      const declined = J(dec.buzz.slice(-2)) === J([[60, 80, 60], 30]);
      ok &&= ringOut && declined;
      bits.push(`haptics: ring-out ${ringOut ? "6 rings + miss + booked" : "WRONG " + J(out.buzz)}, decline ${declined ? "miss + booked" : "WRONG " + J(dec.buzz)}`);
    }
    return { ok, detail: bits.join("; ") };
  });

  /* What a settled frame credits: the lock-screen notes, every SALVAGED
     stamp, the ledger's rows, the owner card, and every RENDERED text in
     sections 1-2 that names a given caller. */
  const credits = (page, firstName) =>
    page.evaluate(
      ({ firstName, stampLabel }) => {
        const shown = (el) => {
          if (!el || el.getClientRects().length === 0) return false;
          let o = 1;
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.display === "none" || cs.visibility === "hidden") return false;
            o *= parseFloat(cs.opacity || "1");
          }
          return o > 0.05 && el.getBoundingClientRect().height > 1;
        };
        const note = (k) => {
          const el = document.querySelector(`[data-owner-note="${k}"]`);
          return el && el.getBoundingClientRect().height > 1 && getComputedStyle(el).visibility !== "hidden" ? el.textContent.replace(/\s+/g, " ").trim() : null;
        };
        const stampEls = [...document.querySelectorAll("*")].filter((el) => el.childElementCount === 0 && el.textContent.trim() === stampLabel);
        const stamps = stampEls.map((s) => ({ row: s.closest("[data-caught-row]")?.querySelector("[data-caught-name]")?.textContent.trim() ?? null, shown: shown(s) }));
        const rows = [...document.querySelectorAll("[data-caught-name]")].filter(shown).map((e) => e.textContent.trim());
        const card = document.querySelector("[data-notify-ledger]")?.textContent.replace(/\s+/g, " ").trim() ?? "";
        /* The first caller, anywhere rendered in sections 1-2. */
        const firstHits = [];
        for (const sec of document.querySelectorAll('[data-section="call"], [data-section="save"]')) {
          const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
          for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
            if (tn.textContent.includes(firstName) && shown(tn.parentElement)) firstHits.push(tn.parentElement.tagName + ":" + tn.textContent.trim().slice(0, 40));
          }
        }
        return { missed: note("missed"), text: note("text"), booked: note("booked"), stamps, rows, card, firstHits };
      },
      { firstName, stampLabel: X.stampLabel },
    );

  /* ---- 230 (change 43a.1): the answered path credits the SECOND caller,
     once. Answer the first call: SECOND_GAP after its in-call screen a
     second call rings from caught[1] — its slider disabled ("You're on a
     job."), Decline inert, a drag goes nowhere — and rings out: Missed
     call, Text sent, Booked, all for the second caller. Exactly ONE
     SALVAGED stamp on the page, on the second caller's row; the first
     (answered) caller is credited nowhere — not in the notes, the ledger,
     the owner card or any rendered text of sections 1-2. ---- */
  const c0 = X.caught[0];
  const c1 = X.caught[1];
  await gate(230, `43a.1: answered -> a second call from ${c1.name} rings out; exactly one ${X.stampLabel} credit, to ${c1.name}; the answered ${c0.name} is credited nowhere`, async (browser, vp, eng) => {
    const { ctx, page } = await open(browser, vp, eng);
    await waitReal(page, 1.0);
    await drag(page, 0.95);
    await page.waitForFunction(() => document.querySelector("[data-demo]")?.dataset.callSecond === "ringing", null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const face = await page.evaluate(() => {
      const vis = (el) => !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
      const q = (s) => document.querySelector(s);
      return {
        caller1: vis(q("[data-owner-caller]")),
        caller2: vis(q("[data-owner-caller-2]")) ? q("[data-owner-caller-2]").textContent.trim() : null,
        slideLabel: vis(q("[data-owner-slide-label]")),
        onAJob: vis(q("[data-owner-onajob]")) ? q("[data-owner-onajob]").textContent.trim() : null,
        knobDisabled: q("[data-owner-knob]").getAttribute("aria-disabled"),
        declineDisabled: q("[data-owner-decline]").getAttribute("aria-disabled"),
      };
    });
    /* The disabled controls do nothing: a full drag, then Decline. */
    await drag(page, 0.95);
    await page.click("[data-owner-decline]", { force: true });
    await page.waitForTimeout(300);
    const still = await page.evaluate(() => ({ ...document.querySelector("[data-demo]").dataset }));
    await waitStory(page, SETTLED);
    await page.waitForTimeout(300);
    const cr = await credits(page, c0.name);
    await ctx.close();
    const amount = `$${c1.amount}`;
    const ok =
      face.caller1 === false &&
      face.caller2 === c1.name &&
      face.slideLabel === false &&
      face.onAJob === X.onAJob &&
      face.knobDisabled === "true" &&
      face.declineDisabled === "true" &&
      still.callPath === "answered" &&
      still.callSecond === "ringing" &&
      cr.missed?.includes(c1.name) &&
      cr.booked?.includes(c1.name) &&
      cr.booked?.includes(amount) &&
      cr.stamps.length === 1 &&
      cr.stamps[0].row === c1.name &&
      cr.rows[0] === c1.name &&
      !cr.rows.includes(c0.name) &&
      cr.card.includes(c1.name) &&
      !cr.card.includes(c0.name) &&
      cr.firstHits.length === 0;
    return {
      ok,
      detail:
        `second call: caller ${JSON.stringify(face.caller2)} (first hidden ${!face.caller1}), slider label ${JSON.stringify(face.onAJob)}, knob/decline aria-disabled ${face.knobDisabled}/${face.declineDisabled}; ` +
        `drag + Decline during it -> ${still.callPath}/${still.callSecond} (need answered/ringing); ` +
        `settled: missed ${JSON.stringify(cr.missed?.slice(-24))}, booked ${JSON.stringify(cr.booked?.slice(0, 60))}; ` +
        `stamps ${JSON.stringify(cr.stamps)} (need exactly 1, on ${c1.name}); rows ${JSON.stringify(cr.rows)}; ` +
        `card names ${c1.name} ${cr.card.includes(c1.name)}, ${c0.name} ${cr.card.includes(c0.name)}; ${c0.name} rendered in s1-s2 ${JSON.stringify(cr.firstHits)} (need none)`,
    };
  });

  /* ---- 231 (change 43a.1): reduced motion — the state changes, nothing
     travels. The owner's phone stands STILL on the incoming call (the
     caller, Decline, a tappable Answer labelled "slide to answer", the
     stake at the ticket, no note landed). A tap on Answer and a tap on
     Decline each cut to the SAME settled frame the moving path ends on —
     the answered one crediting the second caller — with no animation
     frame requested and the clock never started. ---- */
  await gate(231, `43a.1: reduced motion — a still incoming call; Answer and Decline cut to the moving paths' settled frames with no rAF`, async (browser, vp, eng) => {
    const SPY = () => {
      window.__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        window.__raf++;
        return orig(cb);
      };
    };
    const frame = (page) =>
      page.evaluate(() => {
        const d = document.querySelector("[data-demo]").dataset;
        const inc = document.querySelector("[data-owner-incoming]");
        const stake = [...document.querySelectorAll("[data-stake-value]")].find((e) => e.getClientRects().length > 0);
        const track = document.querySelector("[data-owner-track]");
        return {
          t: d.t,
          path: d.callPath,
          second: d.callSecond,
          incoming: getComputedStyle(inc).visibility === "visible" && getComputedStyle(inc).opacity === "1",
          caller: document.querySelector("[data-owner-caller]").textContent.trim(),
          answerLabel: track.querySelector("[data-owner-slide-label]").textContent.trim(),
          decline: getComputedStyle(document.querySelector("[data-owner-decline]")).display !== "none",
          landed: [...document.querySelectorAll("[data-owner-note]")].filter((n) => n.getBoundingClientRect().height > 1 && getComputedStyle(n).visibility !== "hidden").length,
          rail: [...document.querySelectorAll("[data-rail-fill]")].map((e) => e.style.transform),
          money: getComputedStyle(document.querySelector("[data-beat-money]")).opacity,
          stake: stake?.textContent.trim(),
          raf: window.__raf,
        };
      });
    const runChoice = async (choice) => {
      const { ctx, page } = await open(browser, vp, eng, { reducedMotion: "reduce" }, SPY);
      await page.waitForTimeout(1200);
      const pre = await frame(page);
      if (choice === "answer") await page.click("[data-owner-track]");
      else await page.click("[data-owner-decline]");
      await page.waitForTimeout(1000);
      const post = await frame(page);
      const cr = await credits(page, c0.name);
      await ctx.close();
      return { pre, post, cr };
    };
    const a = await runChoice("answer");
    const d = await runChoice("decline");
    const full = (r) => r.rail.every((x) => x === "scaleX(1)") && r.money === "1";
    const preOk = (p) => p.t === "settled" && p.path === "ringing" && p.incoming && p.caller === X.customerName && p.answerLabel === X.slideToAnswer && p.decline && p.landed === 0 && p.stake === usd(X.ticket);
    const ok =
      preOk(a.pre) &&
      preOk(d.pre) &&
      a.post.t === "settled" &&
      a.post.path === "answered" &&
      a.post.second === "missed" &&
      !a.post.incoming &&
      a.post.landed === 3 &&
      full(a.post) &&
      a.post.raf === a.pre.raf &&
      a.cr.booked?.includes(c1.name) &&
      a.cr.stamps.length === 1 &&
      a.cr.stamps[0].row === c1.name &&
      a.cr.firstHits.length === 0 &&
      d.post.t === "settled" &&
      d.post.path === "missed" &&
      !d.post.incoming &&
      d.post.landed === 3 &&
      full(d.post) &&
      d.post.raf === d.pre.raf &&
      d.cr.booked?.includes(c0.name) &&
      d.cr.stamps.length === 1 &&
      d.cr.stamps[0].row === c0.name;
    const pre = (p) => `t ${p.t}, ${p.path}, still incoming ${p.incoming} (${p.caller}), Answer ${JSON.stringify(p.answerLabel)}, Decline ${p.decline}, landed ${p.landed}, stake ${p.stake}`;
    const post = (p, cr) => `${p.path}/${p.second || "-"}, t ${p.t}, incoming ${p.incoming}, landed ${p.landed}, rail+money ${full(p)}, rAF after tap ${p.raf}, booked ${JSON.stringify(cr.booked?.slice(0, 40))}, stamp on ${cr.stamps.map((s) => s.row).join("/")}`;
    return { ok, detail: `before: ${pre(a.pre)}; Answer -> ${post(a.post, a.cr)} (rAF before ${a.pre.raf}); Decline -> ${post(d.post, d.cr)}` };
  });

  /* ---- 229: the story cannot be stranded. (a) Turning sound on after an
     answer does not ring the phone again (an answered call also holds the
     story clock under 3.6). (b) Leaving section 1 mid-ring parks the run —
     no ring-out off screen — and coming back rings it from the top. (c) A
     load in landscape (the guard hides the app, so nothing measures) then
     a rotate upright: the slider's travel is real — a 40% drag does not
     answer. ---- */
  if (!only.length || only.includes(229)) {
    const notes = [];
    let ok = true;
    for (const { name: eng, browser } of engines) {
      try {
        const vp = { width: 390, height: 844 };
        /* (a) */
        const a = await open(browser, vp, eng);
        await waitReal(a.page, 0.8);
        await drag(a.page, 0.95);
        await a.page.waitForTimeout(250);
        const aBefore = await call(a.page);
        await a.page.click("[data-sound-toggle]");
        await a.page.waitForTimeout(500);
        const aAfter = await call(a.page);
        await a.ctx.close();
        const aOk = aBefore.path === "answered" && aAfter.path === "answered" && aAfter.real > aBefore.real;
        /* (b) */
        const b = await open(browser, vp, eng);
        await waitReal(b.page, 1.5);
        await b.page.evaluate(() => {
          const p = document.querySelector("[data-pager]");
          p.scrollTop = p.clientHeight;
        });
        await b.page.waitForTimeout(400);
        const bAway = await b.page.evaluate(() => ({ ...document.querySelector("[data-demo]").dataset }));
        await b.page.waitForTimeout(7000);
        const bLater = await b.page.evaluate(() => ({ ...document.querySelector("[data-demo]").dataset }));
        await b.page.evaluate(() => {
          document.querySelector("[data-pager]").scrollTop = 0;
        });
        await b.page.waitForTimeout(1200);
        const bBack = await call(b.page);
        await b.ctx.close();
        const bOk =
          bAway.t === "0.000" && bAway.callPath === "ringing" && bLater.t === "0.000" && bLater.callPath === "ringing" && bBack.path === "ringing" && bBack.real > 0.3;
        /* (c) */
        const c = await open(browser, { width: 844, height: 390 }, eng);
        await c.page.waitForTimeout(800);
        await c.page.setViewportSize({ width: 390, height: 844 });
        await waitReal(c.page, 0.8);
        const cDrag = await drag(c.page, 0.4);
        await c.page.waitForTimeout(500);
        const cAfter = await call(c.page);
        await c.ctx.close();
        const cOk = cDrag.g.maxDesign > 100 && cDrag.held.x / cDrag.g.maxDesign > 0.3 && cAfter.path === "ringing";
        ok &&= aOk && bOk && cOk;
        notes.push(
          `${eng}: (a) answered then sound on -> ${aAfter.path} (real ${aBefore.real.toFixed(2)} -> ${aAfter.real.toFixed(2)}, need still answered, no reset) ${aOk ? "ok" : "RED"}; ` +
            `(b) left at 1.5s -> t ${bAway.t}/${bAway.callPath}, +7s t ${bLater.t}/${bLater.callPath} (need parked 0.000/ringing), back -> ${bBack.path} real ${bBack.real.toFixed(2)} ${bOk ? "ok" : "RED"}; ` +
            `(c) landscape load -> upright: travel ${cDrag.g.maxDesign} design px, 40% hold x=${cDrag.held.x.toFixed(1)}, after release ${cAfter.path} ${cOk ? "ok" : "RED"}`,
        );
      } catch (err) {
        ok = false;
        notes.push(`${eng} THREW: ${String(err.message).split("\n")[0].slice(0, 160)}`);
      }
    }
    if (wkError && !allowNoWebkit) {
      ok = false;
      notes.push(`WebKit unavailable: ${wkError}`);
    }
    check(229, "43a: the story cannot be stranded — sound-on after an answer, leaving section 1 mid-ring, a landscape load rotated upright (390x844 / 844x390)", ok, notes.join(" | ") + noWk);
  }

  for (const { browser } of engines) await browser.close();
}

/* Standalone. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const pw = createRequire(import.meta.url)("playwright");
  const results = [];
  await runOwnerGates({ base, pw, check: (n, name, pass, detail) => results.push({ n, name, pass, detail }) });
  if (process.env.OWNER_ONLY) console.log(`  (filtered: OWNER_ONLY=${process.env.OWNER_ONLY})`);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} OWNER GATE(S) RED: ${failed.map((r) => r.n).join(", ")}` : `\nALL ${results.length} OWNER GATES PASS`);
  process.exitCode = failed.length ? 1 : 0;
}
