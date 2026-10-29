/*
 * change 42: the /go gates, 207-212; change 45: 217-223.  Run by scripts/gate.mjs after its own
 * browser block, or alone:
 *
 *   NODE_PATH=<playwright>/node_modules node scripts/gate-go.mjs <baseUrl>
 *
 * Standing rule 5 holds here too: expectations are read out of
 * lib/client.config.ts, observations out of the live DOM and the bytes of
 * the real downloads.  Every gate runs in Chromium AND WebKit at 390x844
 * and 844x390 (gate 208 and 209 at 390x844: they test strings and clocks,
 * not layout).  A missing WebKit is red — unless GATE_ALLOW_NO_WEBKIT=1,
 * which is for containers without the browser and says so in every detail.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];
/* change 45 (v2): the change-45 gates run at the v2 set — 390x700,
   390x844, 844x390, 1440x900 — in both engines. */
const V2 = [
  { width: 390, height: 700 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];
/* The hours Andy approved — v2 change 45 (Mon-Sat 07-18) and change 45.1
   (dental opens 08:00) — per preset. Held HERE as well as read from config:
   a gate that only read config would move with an off-by-one there and
   never catch it. */
const APPROVED_HOURS = {
  salon: { days: [1, 2, 3, 4, 5, 6], open: 7, close: 18 },
  home: { days: [1, 2, 3, 4, 5, 6], open: 7, close: 18 },
  dental: { days: [1, 2, 3, 4, 5, 6], open: 8, close: 18 },
  other: { days: [1, 2, 3, 4, 5, 6], open: 7, close: 18 },
};
const BIZ = "Robinson's Heating & Air";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const FB_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]";

function expectations(src) {
  const need = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`gate-go setup: could not read ${label} from lib/client.config.ts`);
    return m[1];
  };
  const go = src.slice(src.indexOf("  go: {"));
  return {
    smsHref: need(/smsHref:\s*"([^"]+)"/, "COPY.contact.smsHref"),
    goTel: need(/goTel:\s*"([^"]+)"/, "COPY.goTel"),
    smsBody: need(/smsBody:\s*"([^"]+)"/, "COPY.go.smsBody"),
    bookedLabel: need(/bookedLabel:\s*"([^"]+)"/, "COPY.notify.bookedLabel"),
    homeTicket: +need(/id: "home"[\s\S]*?ticket:\s*(\d+)/, "home ticket"),
    homeRecovered: +need(/id: "home"[\s\S]*?recovered:\s*(\d+)/, "home recovered"),
    maxName: +need(/export const MAX_NAME_LEN = (\d+)/, "MAX_NAME_LEN"),
    hvacJob0: (go.match(/hvac:\s*\["([^"]+)"/) ?? [])[1],
    /* change 45 */
    goOpen: (go.match(/\bopen:\s*"([^"]+)"/) ?? [])[1],
    goClosed: (go.match(/\bclosed:\s*"([^"]+)"/) ?? [])[1],
    proofReply: (go.match(/proofReply:\s*"([^"]+)"/) ?? [])[1],
    proofRadius: (go.match(/proofRadius:\s*"([^"]+)"/) ?? [])[1],
    installHint: (go.match(/installHint:\s*"([^"]+)"/) ?? [])[1],
    doneTitle: (go.match(/doneTitle:\s*"([^"]+)"/) ?? [])[1],
    quoteDoneTitle: (go.match(/quoteDoneTitle:\s*"([^"]+)"/) ?? [])[1],
    jobs: (() => {
      const block = src.slice(src.indexOf("  jobs: {"), src.indexOf("  tradeLabels:"));
      const out = {};
      for (const m of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
      return out;
    })(),
    jobGlyph: (() => {
      const block = src.slice(src.indexOf("export const JOB_GLYPH"));
      const body = block.slice(0, block.indexOf("};"));
      return Object.fromEntries([...body.matchAll(/^\s*"([^"]+)":\s*"([^"]+)",/gm)].map((m) => [m[1], m[2]]));
    })(),
    presets: (() => {
      const marks = [...src.matchAll(/id: "([a-z]+)"/g)].map((m) => ({ id: m[1], at: m.index }));
      return marks.map((mk, i) => {
        const b = src.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : src.length);
        return {
          id: mk.id,
          block: b,
          accent: (b.match(/accent:\s*"(#[0-9A-Fa-f]{6})"/) ?? [])[1],
          accentInk: (b.match(/accentInk:\s*"(#[0-9A-Fa-f]{6})"/) ?? [])[1],
          /* change 53: null is a stored value (salon: no service area);
             a missing field stays NaN and holds 221 red. */
          radius: (() => {
            const m = b.match(/radius:\s*(\d+|null)\b/);
            return !m ? NaN : m[1] === "null" ? null : +m[1];
          })(),
          hours: (() => {
            const m = b.match(/hours:\s*\{\s*days:\s*(\[[\d,\s]+\]),\s*open:\s*(\d+),\s*close:\s*(\d+)\s*\}/);
            return m ? { days: JSON.parse(m[1]), open: +m[2], close: +m[3] } : null;
          })(),
          thread: [...b.matchAll(/\{\s*from:\s*"(business|customer)",\s*time:\s*"([^"]+)"/g)].map((m) => ({ from: m[1], time: m[2] })),
        };
      });
    })(),
  };
}

/* Independent of lib/go.ts: the typical reply from the stored thread —
   every customer -> business gap, median, rounded. */
const replyMinutes = (thread) => {
  const mins = (t) => {
    const m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    return ((+m[1] % 12) + (/p/i.test(m[3]) ? 12 : 0)) * 60 + +m[2];
  };
  const gaps = [];
  for (let i = 0; i + 1 < thread.length; i++) if (thread[i].from === "customer" && thread[i + 1].from === "business") gaps.push(mins(thread[i + 1].time) - mins(thread[i].time));
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length ? Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2) : null;
};
const hexRgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const etWeekday = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(ms);
const etTime = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(ms);
const etMinute = (ms) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(ms);
  const get = (t) => +(p.find((x) => x.type === t)?.value ?? NaN);
  return (get("hour") % 24) * 60 + get("minute");
};
const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export async function runGoGates({ base, pw, check }) {
  const src = readFileSync(join(ROOT, "lib", "client.config.ts"), "utf8");
  const X = expectations(src);
  const allowNoWebkit = process.env.GATE_ALLOW_NO_WEBKIT === "1";
  const url = (q) => `${base}/go?${q}`;
  const bizQ = `biz=${encodeURIComponent(BIZ)}&trade=hvac&demo=1`;

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

  const ctxFor = (browser, vp, extra = {}) =>
    browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, acceptDownloads: true, ...extra });

  /* Runs fn per engine (x viewport); green only if every run is green and
     WebKit ran (or the container waiver is set). */
  /* GO_ONLY=217,212 runs just those gates — for mutation proofs from the
     standalone entry point only. scripts/gate.mjs never sets it, so the full
     suite always runs every gate, and a filtered run says so in its output. */
  const only = (process.env.GO_ONLY ?? "").split(",").map(Number).filter(Boolean);
  const gate = async (n, name, fn, { viewports = VIEWPORTS } = {}) => {
    if (only.length && !only.includes(n)) return;
    const notes = [];
    let ok = true;
    for (const { name: eng, browser } of engines) {
      for (const vp of viewports) {
        try {
          const r = await fn(browser, vp, eng);
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

  /* The booking flow to the done state; returns the fast-path slot start. */
  const book = async (page) => {
    await page.click("[data-go-slot=book]");
    await page.waitForSelector("[data-go-job]");
    await page.click("[data-go-job] >> nth=0");
    await page.waitForSelector("[data-go-fast]");
    const start = +(await page.getAttribute("[data-go-fast]", "data-start"));
    await page.click("[data-go-fast]");
    await page.fill("[data-go-field=name]", "Pat Doe");
    await page.fill("[data-go-field=phone]", "8045550142");
    await page.click("[data-go-confirm]");
    await page.waitForSelector("[data-go-done]");
    return start;
  };
  const readDownload = async (page, selector) => {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click(selector)]);
    const path = await dl.path();
    return { name: dl.suggestedFilename(), body: readFileSync(path, "utf8") };
  };

  /* --- 207: no horizontal overflow; every slot >= 56px --- */
  await gate(207, "go: no x-overflow, slots >= 56px", async (browser, vp) => {
    const ctx = await ctxFor(browser, vp);
    const page = await ctx.newPage();
    await page.goto(url(bizQ), { waitUntil: "networkidle" });
    const measure = () =>
      page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = document.documentElement.scrollWidth - vw;
        const els = [...document.querySelectorAll("[data-go-slot], [data-go-job], [data-go-time], [data-go-fast], [data-go-confirm], [data-go-field]")]
          .filter((e) => e.getClientRects().length > 0);
        const small = els
          .map((e) => ({ k: e.getAttribute("data-go-slot") ?? e.tagName, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          /* 0.01px of float noise is layout rounding, not a short slot. */
          .filter((r) => r.h < 55.99 || r.w < 55.99);
        return { over, n: els.length, small };
      });
    const idle = await measure();
    await page.click("[data-go-slot=book]");
    await page.waitForSelector("[data-go-job]");
    const jobs = await measure();
    await page.click("[data-go-job] >> nth=0");
    await page.waitForSelector("[data-go-time]");
    const times = await measure();
    await page.click("[data-go-fast]");
    const you = await measure();
    await ctx.close();
    const all = [idle, jobs, times, you];
    const ok = idle.n === 6 && all.every((m) => m.over <= 0 && m.small.length === 0);
    return {
      ok,
      detail: `slots ${idle.n}/6; overflow ${all.map((m) => m.over).join("/")}px; under-56 ${JSON.stringify(all.flatMap((m) => m.small)).slice(0, 120)}`,
    };
  });

  /* --- 208: tel, sms separator per UA, .ics and .vcf bytes --- */
  await gate(
    208,
    "go: tel / sms / ics / vcf contents",
    async (browser, vp) => {
      const body = encodeURIComponent(X.smsBody.replace(/\{biz\}/g, BIZ));
      const out = [];
      let ok = true;
      for (const [label, ua, sep] of [
        ["ios", IOS_UA, "&"],
        ["android", ANDROID_UA, "?"],
      ]) {
        const ctx = await ctxFor(browser, vp, { userAgent: ua });
        const page = await ctx.newPage();
        await page.goto(url(bizQ), { waitUntil: "networkidle" });
        const hrefs = await page.evaluate(() => ({
          text: document.querySelector("[data-go-slot=text]")?.getAttribute("href"),
          call: document.querySelector("[data-go-slot=call]")?.getAttribute("href"),
          emergency: document.querySelector("[data-go-slot=emergency]")?.getAttribute("href"),
        }));
        const smsOk = hrefs.text === `${X.smsHref}${sep}body=${body}`;
        const telOk = hrefs.call === X.goTel && hrefs.emergency === X.goTel;
        ok &&= smsOk && telOk;
        out.push(`${label} sms ${smsOk ? "ok" : JSON.stringify(hrefs.text)} tel ${telOk ? "ok" : JSON.stringify([hrefs.call, hrefs.emergency])}`);
        if (label === "ios") {
          const vcf = await readDownload(page, "[data-go-slot=save]");
          const vcfWant = ["BEGIN:VCARD", "VERSION:3.0", `FN:${BIZ}`, `ORG:${BIZ}`, `TEL;TYPE=WORK,VOICE:${X.goTel.replace(/^tel:/, "")}`, "END:VCARD", ""].join("\r\n");
          const vcfOk = vcf.body === vcfWant && vcf.name.endsWith(".vcf");
          const start = await book(page);
          const ics = await readDownload(page, "[data-go-cal]");
          const lines = ics.body.split("\r\n");
          const icsOk =
            ics.name.endsWith(".ics") &&
            ics.body.endsWith("\r\n") &&
            !/[^\r]\n/.test(ics.body) &&
            lines[0] === "BEGIN:VCALENDAR" &&
            lines.includes("BEGIN:VEVENT") &&
            lines.includes(`DTSTART:${icsStamp(start)}`) &&
            lines.includes(`DTEND:${icsStamp(start + 3_600_000)}`) &&
            lines.includes(`SUMMARY:${X.hvacJob0} · ${BIZ}`) &&
            lines.at(-2) === "END:VCALENDAR";
          ok &&= vcfOk && icsOk;
          out.push(`vcf ${vcfOk ? "ok" : JSON.stringify(vcf.body)}`, `ics ${icsOk ? "ok" : JSON.stringify(ics.body).slice(0, 200)}`);
        }
        await ctx.close();
      }
      /* Facebook's in-app browser: Google Calendar template, number + Copy. */
      const ctx = await ctxFor(browser, vp, { userAgent: FB_UA });
      const page = await ctx.newPage();
      await page.goto(url(bizQ), { waitUntil: "networkidle" });
      const start = await book(page);
      const cal = await page.getAttribute("[data-go-cal]", "href");
      const calOk =
        !!cal &&
        cal.startsWith("https://calendar.google.com/calendar/render?") &&
        new URL(cal).searchParams.get("dates") === `${icsStamp(start)}/${icsStamp(start + 3_600_000)}` &&
        new URL(cal).searchParams.get("text") === `${X.hvacJob0} · ${BIZ}`;
      await page.click("[data-go-save]");
      await page.waitForSelector("[data-go-copy]");
      const shown = await page.inputValue("#go-copy-field");
      const copyOk = shown.replace(/\D/g, "") === X.goTel.replace(/\D/g, "").slice(1);
      ok &&= calOk && copyOk;
      out.push(`in-app cal ${calOk ? "ok" : JSON.stringify(cal)} copy ${copyOk ? "ok" : JSON.stringify(shown)}`);
      await ctx.close();
      return { ok, detail: out.join("; ") };
    },
    { viewports: [VIEWPORTS[0]] },
  );

  /* --- 209: frozen clocks — Sun 12:05 ET and the 2026-11-01 01:30 fall-back --- */
  await gate(
    209,
    "go: slots under a frozen ET clock",
    async (browser, vp) => {
      const clocks = [
        { label: "Sun 12:05 EDT", now: Date.parse("2026-10-18T16:05:00Z"), first: Date.parse("2026-10-19T12:00:00Z") },
        { label: "11-01 01:30 EDT", now: Date.parse("2026-11-01T05:30:00Z"), first: Date.parse("2026-11-02T13:00:00Z") },
        { label: "11-01 01:30 EST", now: Date.parse("2026-11-01T06:30:00Z"), first: Date.parse("2026-11-02T13:00:00Z") },
      ];
      const FULL = ["8:00 AM", "10:00 AM", "1:00 PM", "3:00 PM"].join(",");
      const out = [];
      let ok = true;
      for (const c of clocks) {
        const ctx = await ctxFor(browser, vp);
        const page = await ctx.newPage();
        await page.clock.install({ time: c.now });
        await page.goto(url(bizQ), { waitUntil: "networkidle" });
        /* change 45: read only once the page has re-rendered on the frozen
           client clock — the dial's minute is that signal. A read at
           networkidle could still see the server's request-time line. */
        await page.waitForFunction((m) => document.querySelector("[data-go-dial]")?.getAttribute("data-minute") === String(m), etMinute(c.now), { timeout: 8000 });
        const sub = await page.textContent("[data-go-next]");
        await page.click("[data-go-slot=book]");
        await page.click("[data-go-job] >> nth=0");
        await page.waitForSelector("[data-go-time]");
        const days = await page.evaluate(() =>
          [...document.querySelectorAll("[data-go-day]")].map((d) => ({
            key: d.getAttribute("data-go-day"),
            slots: [...d.querySelectorAll("[data-go-time]")].map((b) => ({ start: +b.getAttribute("data-start"), text: b.textContent.trim() })),
          })),
        );
        const fast = +(await page.getAttribute("[data-go-fast]", "data-start"));
        await ctx.close();
        const starts = days.flatMap((d) => d.slots.map((s) => s.start));
        const checks = {
          threeDays: days.length === 3,
          noSunday: starts.every((s) => etWeekday(s) !== "Sun"),
          noPast: starts.every((s) => s > c.now),
          perDay: days.every((d, i) => d.slots.length >= 1 && d.slots.length <= 4 && (i === 0 || d.slots.length === 4)),
          fullDays: days.slice(1).every((d) => d.slots.map((s) => s.text).join(",") === FULL),
          textsMatchInstants: days.every((d) => d.slots.every((s) => s.text === etTime(s.start))),
          first: starts[0] === c.first && fast === c.first,
          subLine: (sub ?? "").includes(`${etWeekday(c.first)} ${etTime(c.first)}`),
        };
        const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
        ok &&= bad.length === 0;
        out.push(`${c.label}: ${bad.length ? "RED " + bad.join(",") + " " + JSON.stringify(days.map((d) => [d.key, d.slots.map((s) => s.text)])).slice(0, 160) + " sub=" + JSON.stringify(sub) : "ok " + days.map((d) => d.key).join(",")}`);
      }
      return { ok, detail: out.join("; ") };
    },
    { viewports: [VIEWPORTS[0]] },
  );

  /* --- 210: hostile and over-long names render escaped and clamped --- */
  await gate(210, "go: biz escaped and clamped", async (browser, vp) => {
    const ctx = await ctxFor(browser, vp);
    const page = await ctx.newPage();
    const out = [];
    let ok = true;
    await page.goto(url(`biz=${encodeURIComponent("<b>x</b>")}&demo=1`), { waitUntil: "networkidle" });
    const tag = await page.evaluate(() => {
      const h = document.querySelector("[data-go-name]");
      return { text: h?.textContent, kids: h?.children.length, bold: document.querySelectorAll("main b").length, title: document.title };
    });
    const tagOk = tag.text === "<b>x</b>" && tag.kids === 0 && tag.bold === 0 && tag.title === "<b>x</b>";
    ok &&= tagOk;
    out.push(`<b>: ${tagOk ? "ok" : JSON.stringify(tag)}`);
    const words = "Abcdefghij ".repeat(19).slice(0, 200);
    for (const [label, raw] of [
      ["200 spaced", words],
      ["200 solid", "W".repeat(200)],
    ]) {
      await page.goto(url(`biz=${encodeURIComponent(raw)}&demo=1`), { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const h = document.querySelector("[data-go-name]");
        const lh = parseFloat(getComputedStyle(h).lineHeight);
        return {
          len: h.textContent.length,
          lines: Math.round(h.getBoundingClientRect().height / lh),
          over: h.scrollWidth - h.clientWidth,
          docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      const want = raw.trim().slice(0, X.maxName).length;
      const good = m.len === want && m.len <= X.maxName && m.lines <= 2 && m.over <= 0 && m.docOver <= 0;
      ok &&= good;
      out.push(`${label}: ${good ? "ok" : "RED"} len ${m.len}/${X.maxName} lines ${m.lines} over ${m.over}/${m.docOver}`);
    }
    await ctx.close();
    return { ok, detail: out.join("; ") };
  });

  /* --- 211: the rotate guard covers / sideways and never /go --- */
  await gate(
    211,
    "go: rotate guard on /, not on /go",
    async (browser, vp) => {
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      const probe = () =>
        page.evaluate(() => {
          const g = document.querySelector("[data-rotate-guard]");
          const r = g?.getBoundingClientRect();
          const guard = !!g && getComputedStyle(g).display !== "none" && r.width >= innerWidth && r.height >= innerHeight;
          const name = document.querySelector("[data-go-name]");
          const nr = name?.getBoundingClientRect();
          return { guard, name: !!name && nr.width > 0 && nr.height > 0 && getComputedStyle(name).visibility !== "hidden" };
        });
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      const home = await probe();
      await page.goto(url(bizQ), { waitUntil: "networkidle" });
      const go = await probe();
      await ctx.close();
      return { ok: home.guard && !go.guard && go.name, detail: `/ guard ${home.guard}; /go guard ${go.guard}, name visible ${go.name}` };
    },
    { viewports: [VIEWPORTS[1]] },
  );

  /* --- 212 (amended, change 45 F10): the owner's phone is PINNED on the
         page in demo mode — on load with the stored caller, and the
         visitor's booking lands on top when the sheet closes. The ticket is
         the preset's STORED value. Live mode has no owner phone. --- */
  await gate(212, "go: demo owner phone shows the booking and +ticket", async (browser, vp) => {
    const ctx = await ctxFor(browser, vp);
    const page = await ctx.newPage();
    await page.goto(url(bizQ), { waitUntil: "networkidle" });
    const onLoad = await page.evaluate(() => !!document.querySelector("[data-go-owner] [data-go-notify]"));
    await book(page);
    await page.click("[data-go-close]");
    await page.waitForFunction(() => document.querySelector("[data-go-sheet]")?.getAttribute("data-go-sheet") === "closed");
    await page.waitForTimeout(1100);
    const demo = await page.evaluate(() => {
      const owner = document.querySelector("[data-go-owner]");
      const n = document.querySelector("[data-go-notify]");
      const t = n?.querySelector("[data-go-ticket]");
      const cs = n ? getComputedStyle(n) : null;
      return {
        owner: !!owner && owner.getClientRects().length > 0,
        cards: document.querySelectorAll("[data-go-notify]").length,
        notify: n?.textContent ?? "",
        landed: !!cs && cs.opacity === "1" && (cs.transform === "none" || cs.transform === "matrix(1, 0, 0, 1, 0, 0)"),
        ticket: t?.textContent.trim() ?? null,
        tColor: t ? getComputedStyle(t).color : null,
        gold: getComputedStyle(document.documentElement).getPropertyValue("--color-gold").trim(),
      };
    });
    await page.goto(url(`biz=${encodeURIComponent(BIZ)}&trade=hvac`), { waitUntil: "networkidle" });
    const live = await page.evaluate(() => !!document.querySelector("[data-go-owner]"));
    await ctx.close();
    const want = `+${usd(X.homeTicket)}`;
    /* The ticket's ink must BE the gold token (Tailwind writes the @theme
       tokens onto :root), not merely some warm colour. */
    const goldOk = /^#[0-9A-Fa-f]{6}$/.test(demo.gold) && demo.tColor === hexRgb(demo.gold);
    const ok = onLoad && demo.owner && demo.cards === 2 && demo.notify.includes(X.bookedLabel) && demo.notify.includes("Pat Doe") && demo.landed && demo.ticket === want && goldOk && !live;
    return {
      ok,
      detail: `on load ${onLoad}; after booking ${demo.cards} card(s), top "${X.bookedLabel} · Pat Doe" ${demo.notify.includes("Pat Doe")}, landed ${demo.landed}, ticket ${JSON.stringify(demo.ticket)} want ${want} (stored; recovered is ${X.homeRecovered}), ink ${demo.tColor} ${goldOk ? "= gold" : "NOT gold " + demo.gold}; live mode owner ${live}`,
    };
  });

  /* ======================= change 45: the door, rebuilt ================== */

  /* --- 217 (45a): every slot >= 72px, its glyph box >= 32px, its label
         >= 17px; the emergency band is 64px with the same glyph and label. --- */
  await gate(
    217,
    "go 45a: slots >= 72px, glyph box >= 32px, labels >= 17px",
    async (browser, vp) => {
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      await page.goto(url(bizQ), { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const m = await page.evaluate(() =>
        [...document.querySelectorAll("[data-go-slot]")].map((el) => {
          const svg = el.querySelector("[data-go-glyph] svg");
          const g = svg?.getBoundingClientRect();
          const l = el.querySelector("[data-go-label]");
          return {
            k: el.getAttribute("data-go-slot"),
            h: +el.getBoundingClientRect().height.toFixed(2),
            g: g ? [+g.width.toFixed(2), +g.height.toFixed(2)] : null,
            ink: svg ? getComputedStyle(svg).color : null,
            fs: l ? parseFloat(getComputedStyle(l).fontSize) : null,
          };
        }),
      );
      await ctx.close();
      /* "at full ink": ink on the abyss slots, the preset's inverse ink on
         the accent band — never a light glyph on the fill. */
      const home = X.presets.find((x) => x.id === "home");
      const inkOf = (k) => (k === "emergency" ? hexRgb(home.accentInk) : "rgb(233, 238, 244)");
      const bad = m.filter((x) => {
        const floor = x.k === "emergency" ? 63.99 : 71.99;
        return x.h < floor || !x.g || x.g[0] < 31.99 || x.g[1] < 31.99 || x.fs == null || x.fs < 17 || x.ink !== inkOf(x.k);
      });
      return { ok: m.length === 6 && bad.length === 0, detail: `${m.length}/6 slots; ${m.map((x) => `${x.k} ${x.h}px glyph ${x.g?.join("x")} ${x.ink === inkOf(x.k) ? "full ink" : "INK " + x.ink} label ${x.fs}px`).join(", ")}${bad.length ? "; UNDER: " + bad.map((x) => x.k).join(",") : ""}` };
    },
    { viewports: V2 },
  );

  /* --- 218 (45b): the emergency band is the ONLY accent-filled surface on
         /go — every element's computed background (and ::before / ::after)
         and every filled SVG shape is scanned. A preset without the band has
         none at all. --- */
  await gate(
    218,
    "go 45b: the emergency band is the only accent-filled surface",
    async (browser, vp) => {
      const out = [];
      let ok = true;
      for (const [q, id, want] of [
        [bizQ, "home", 1],
        ["preset=salon&demo=1", "salon", 0],
      ]) {
        const ctx = await ctxFor(browser, vp);
        const page = await ctx.newPage();
        await page.goto(url(q), { waitUntil: "networkidle" });
        await page.waitForTimeout(700);
        const accent = hexRgb(X.presets.find((x) => x.id === id).accent);
        const fills = await page.evaluate((acc) => {
          const hits = [];
          const solid = (c) => c && c.startsWith("rgb(") ? c : c && c.startsWith("rgba(") && parseFloat(c.split(",")[3]) > 0.5 ? c.replace(/^rgba\((\d+), (\d+), (\d+), [\d.]+\)$/, "rgb($1, $2, $3)") : null;
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width * r.height < 40) continue;
            for (const pseudo of [null, "::before", "::after"]) {
              const cs = getComputedStyle(el, pseudo);
              if (pseudo && cs.content === "none") continue;
              if (solid(cs.backgroundColor) === acc) hits.push((el.getAttribute("data-go-slot") ?? el.tagName.toLowerCase() + (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 24)) + (pseudo ?? ""));
            }
            if (el instanceof SVGGeometryElement && getComputedStyle(el).fill && solid(getComputedStyle(el).fill) === acc) hits.push("svg-fill");
          }
          return hits;
        }, accent);
        await ctx.close();
        const good = fills.length === want && (want === 0 || fills[0] === "emergency");
        ok &&= good;
        out.push(`${id}: ${fills.length} accent fill(s) ${JSON.stringify(fills.slice(0, 4))} (want ${want ? "only the emergency band" : "none"})`);
      }
      return { ok, detail: out.join("; ") };
    },
    { viewports: V2 },
  );

  /* --- 219 (45c, change 45.1 per preset): the dial — its arc spans the
         preset's APPROVED hours (held here; config must equal them), drawn
         clockwise the short way through the window's middle hour; open and
         closed under frozen ET clocks; the hand at the frozen minute; the
         arc in accent on an open day and a muted hairline on Sunday. Home
         (07-18) and dental (08-18) — the two hours the presets carry. --- */
  await gate(
    219,
    "go 45c: the dial matches each preset's hours (home 07-18, dental 08-18 ET) under frozen clocks",
    async (browser, vp) => {
      const out = [];
      let ok = true;
      const cfgBad = X.presets.filter((pr) => JSON.stringify(pr.hours) !== JSON.stringify(APPROVED_HOURS[pr.id])).map((pr) => `${pr.id} ${JSON.stringify(pr.hours)}`);
      ok &&= cfgBad.length === 0;
      out.push(`config ${cfgBad.length ? "DIFFERS " + cfgBad.join(", ") : "== approved, every preset"}`);
      const runs = [
        { id: "home", q: bizQ, clocks: [["Sun 12:05", "2026-10-18T16:05:00Z", false, 725, false], ["Mon 06:59", "2026-10-19T10:59:00Z", false, 419, true], ["Mon 07:00", "2026-10-19T11:00:00Z", true, 420, true]] },
        { id: "dental", q: "preset=dental&demo=1", clocks: [["Mon 07:00", "2026-10-19T11:00:00Z", false, 420, true], ["Mon 07:59", "2026-10-19T11:59:00Z", false, 479, true], ["Mon 08:00", "2026-10-19T12:00:00Z", true, 480, true]] },
      ];
      for (const run of runs) {
        const H = APPROVED_HOURS[run.id];
        const accent = hexRgb(X.presets.find((x) => x.id === run.id).accent);
        for (const [label, iso, wantOpen, minute, day] of run.clocks) {
          const ctx = await ctxFor(browser, vp);
          const page = await ctx.newPage();
          await page.clock.install({ time: Date.parse(iso) });
          await page.goto(url(run.q), { waitUntil: "networkidle" });
          await page.waitForFunction((m) => document.querySelector("[data-go-dial]")?.getAttribute("data-minute") === String(m), minute, { timeout: 8000 });
          const d = await page.evaluate(() => {
            const dial = document.querySelector("[data-go-dial]");
            const arc = dial?.querySelector("[data-go-arc]");
            const hand = dial?.querySelector("[data-go-hand]");
            const box = dial?.viewBox.baseVal;
            const pt = arc ? arc.getPointAtLength(arc.getTotalLength() / 2) : null;
            return {
              open: dial?.getAttribute("data-open"),
              d: arc?.getAttribute("d"),
              stroke: arc ? getComputedStyle(arc).stroke : null,
              hand: hand ? [+hand.getAttribute("x2"), +hand.getAttribute("y2")] : null,
              c: box ? box.width / 2 : null,
              mid: pt ? [pt.x, pt.y] : null,
              status: document.querySelector("[data-go-status]")?.textContent.trim(),
            };
          });
          await ctx.close();
          /* Angles back to hours, noon at the top: h = 12 + atan2(dx, -dy)/2pi*24. */
          const hourOf = (x, y) => (((12 + (Math.atan2(x - d.c, d.c - y) / (2 * Math.PI)) * 24) % 24) + 24) % 24;
          const nums = (d.d ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
          const from = nums.length >= 9 ? hourOf(nums[0], nums[1]) : NaN;
          const to = nums.length >= 9 ? hourOf(nums[7], nums[8]) : NaN;
          const mid = d.mid ? hourOf(d.mid[0], d.mid[1]) : NaN;
          const hand = d.hand ? hourOf(d.hand[0], d.hand[1]) : NaN;
          const checks = {
            arcFrom: Math.abs(from - H.open) < 0.05,
            arcTo: Math.abs(to - H.close) < 0.05,
            sweep: nums[6] === 1 && nums[5] === (H.close - H.open > 12 ? 1 : 0),
            mid: Math.abs(mid - (H.open + H.close) / 2) < 0.1,
            open: d.open === (wantOpen ? "1" : "0"),
            status: d.status === (wantOpen ? X.goOpen : X.goClosed),
            hand: Math.abs(hand - minute / 60) < 0.05,
            arcInk: day ? d.stroke === accent : d.stroke !== accent,
          };
          const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
          ok &&= bad.length === 0;
          out.push(`${run.id} ${label}: arc ${from.toFixed(2)}-${to.toFixed(2)}h via ${mid.toFixed(2)}h, ${JSON.stringify(d.status)}${bad.length ? " RED " + bad.join(",") : " ok"}`);
        }
      }
      return { ok, detail: out.join("; ") };
    },
    { viewports: V2 },
  );

  /* --- 220 (45d, amended change 45.1 — the fold): demo mode, 390x664 (the
         Safari-visible height of a 390x844 phone). At t=1s the owner card is
         an iOS banner WHOLLY inside the viewport at full opacity; at t=6s the
         banner is gone and the card stands docked, visible, under the slots.
         Reduced motion: no banner at all, the docked card from the start. --- */
  await gate(
    220,
    "go 45d: the demo owner card arrives as a banner in a 390x664 viewport at t=1s and is docked at t=6s",
    async (browser, vp) => {
      const probe = (page) =>
        page.evaluate(() => {
          const eff = (el) => {
            let o = 1;
            for (let x = el; x && x.nodeType === 1; x = x.parentElement) o *= parseFloat(getComputedStyle(x).opacity);
            return o;
          };
          const bn = document.querySelector("[data-go-banner]");
          const br = bn?.getBoundingClientRect();
          const sm = document.querySelector("[data-go-owner] [data-go-sample]");
          return {
            t: Math.round(performance.now()),
            banner: bn && getComputedStyle(bn).display !== "none" ? { top: Math.round(br.top), bottom: Math.round(br.bottom), left: Math.round(br.left), right: Math.round(br.right), o: +eff(bn).toFixed(2), text: bn.textContent } : null,
            docked: sm ? { vis: getComputedStyle(sm).visibility, o: +eff(sm).toFixed(2), h: Math.round(sm.getBoundingClientRect().height) } : null,
            vw: innerWidth,
            vh: innerHeight,
          };
        });
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      await page.goto(url(bizQ), { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => performance.now() >= 1000);
      const t1 = await probe(page);
      await page.waitForFunction(() => performance.now() >= 6000, undefined, { timeout: 15000 });
      const t6 = await probe(page);
      await ctx.close();
      const rm = await ctxFor(browser, vp, { reducedMotion: "reduce" });
      const rp = await rm.newPage();
      await rp.goto(url(bizQ), { waitUntil: "domcontentloaded" });
      await rp.waitForFunction(() => performance.now() >= 1000);
      const r1 = await probe(rp);
      await rm.close();
      const b = t1.banner;
      const inView = !!b && b.top >= 0 && b.left >= 0 && b.right <= t1.vw && b.bottom <= t1.vh && b.o >= 0.98 && b.text.includes(X.bookedLabel);
      const docked = !t6.banner && !!t6.docked && t6.docked.vis === "visible" && t6.docked.o >= 0.99 && t6.docked.h > 0;
      const reducedOk = !r1.banner && !!r1.docked && r1.docked.vis === "visible";
      return {
        ok: inView && docked && reducedOk,
        detail: `t=${t1.t}ms banner ${b ? `${b.top}-${b.bottom}px of ${t1.vh}, opacity ${b.o}` : "ABSENT"}${inView ? "" : " RED"}; t=${t6.t}ms ${t6.banner ? "banner STILL UP" : "banner gone"}, docked ${t6.docked ? t6.docked.vis : "missing"}${docked ? "" : " RED"}; reduced motion: banner ${r1.banner ? "SHOWN" : "none"}, docked ${r1.docked?.vis}${reducedOk ? "" : " RED"}`,
      };
    },
    { viewports: [{ width: 390, height: 664 }] },
  );

  /* --- 221 (45e): "typical reply" is the STORED thread's gap, per preset —
         recomputed here from config, never read off the page's own math. --- */
  await gate(
    221,
    "go 45e: typical reply equals the stored thread gap, every preset",
    async (browser, vp) => {
      const out = [];
      let ok = true;
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      for (const pr of X.presets) {
        const n = replyMinutes(pr.thread);
        const want = n == null ? null : X.proofReply.replace("{n}", String(n));
        const wantRadius = pr.radius === null ? null : X.proofRadius.replace("{n}", String(pr.radius));
        await page.goto(url(`preset=${pr.id}&demo=1`), { waitUntil: "networkidle" });
        const got = await page.evaluate(() => ({ reply: document.querySelector("[data-go-reply]")?.textContent.trim() ?? null, radius: document.querySelector("[data-go-radius]")?.textContent.trim() ?? null }));
        const good = got.reply === want && got.radius === wantRadius;
        ok &&= good;
        out.push(`${pr.id}: ${JSON.stringify(got.reply)} want ${JSON.stringify(want)}${got.radius === wantRadius ? "" : " radius " + JSON.stringify(got.radius)}`);
      }
      await ctx.close();
      return { ok, detail: out.join("; ") };
    },
    { viewports: V2 },
  );

  /* --- 261 (change 53): the salon door reads as a salon — for a threading,
         hair, lash or nail shop as much as a med spa. Expectations from
         config (jobs.salon, the salon ticket); the rendered text from the
         DOM. FORBIDDEN is pre-registered: the med-spa injectable and the
         service-area unit a walk-in shop never claims. Count guard first:
         the chip list must hold SALON_JOB_COUNT chips, so a selector that
         stops matching can never read as "nothing forbidden". --- */
  const SALON_JOB_COUNT = 5;
  const FORBIDDEN = [/\bfiller\b/i, /\bmiles?\b/i];
  await gate(
    261,
    "go 53: salon door shows salon jobs, a salon sample and no service radius",
    async (browser, vp) => {
      const out = [];
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      await page.goto(url(`biz=${encodeURIComponent("Shortpump Threading")}&preset=salon&demo=1`), { waitUntil: "networkidle" });
      const want = X.jobs.salon ?? [];
      const ticket = +((X.presets.find((p) => p.id === "salon")?.block ?? "").match(/ticket:\s*(\d+)/) ?? [])[1];
      const idle = await page.evaluate(() => {
        const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        const sample = document.querySelector("[data-go-sample]");
        return {
          text: document.querySelector("[data-go]")?.innerText ?? "",
          radius: vis(document.querySelector("[data-go-radius]")),
          sampleJob: sample?.querySelector("p + p")?.textContent.trim() ?? null,
          sampleTicket: sample?.querySelector("[data-go-ticket]")?.textContent.trim() ?? null,
        };
      });
      await page.click("[data-go-slot=book]");
      await page.waitForSelector("[data-go-job]");
      const chips = await page.$$eval("[data-go-job]", (els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.textContent.trim()));
      await ctx.close();
      const countOk = want.length === SALON_JOB_COUNT && chips.length === SALON_JOB_COUNT;
      out.push(`chips ${chips.length}/${SALON_JOB_COUNT} (config ${want.length})`);
      const listOk = chips.every((c, i) => c === want[i]);
      if (!listOk) out.push(`jobs ${JSON.stringify(chips)} want ${JSON.stringify(want)}`);
      const hits = FORBIDDEN.filter((re) => re.test(idle.text) || chips.some((c) => re.test(c)) || want.some((c) => re.test(c))).map(String);
      out.push(hits.length ? `FORBIDDEN ${hits.join(",")}` : "no forbidden terms");
      out.push(idle.radius ? "radius line SHOWN" : "no radius line");
      const sampleOk = idle.sampleJob === want[0] && idle.sampleTicket === `+${usd(ticket)}` && Number.isFinite(ticket);
      out.push(`sample ${JSON.stringify(idle.sampleJob)} ${JSON.stringify(idle.sampleTicket)}${sampleOk ? "" : ` want ${JSON.stringify(want[0])} +${usd(ticket)}`}`);
      return { ok: countOk && listOk && hits.length === 0 && !idle.radius && sampleOk, detail: out.join("; ") };
    },
    { viewports: V2 },
  );

  /* --- 222 (45f): every rendered text node on /go clears 4.5:1, computed —
         the foreground composited over the real stack of backgrounds under
         it. Idle in both modes, each sheet step (inside the panel), done. --- */
  const CONTRAST = () => {
    /* rgb()/rgba(), and the color(srgb r g b / a) form that color-mix()
       computes to. Anything else is reported, never silently skipped. */
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      const k = c.match(/color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)/);
      if (k) return [k[1] * 255, k[2] * 255, k[3] * 255, k[4] == null ? 1 : +k[4]];
      throw new Error("unparsed colour " + c);
    };
    const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      const stack = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3] > 0) {
          stack.push(c);
          if (c[3] >= 1) break;
        }
      }
      let base = parse(getComputedStyle(document.body).backgroundColor);
      if (base[3] < 1) base = [6, 11, 20, 1];
      for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
      return base;
    };
    const scope = document.querySelector('[data-go-sheet="open"]') ? document.querySelector("[data-go-panel]") : document.querySelector("[data-go]");
    const bad = [];
    let n = 0;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest(".sr-only")) continue;
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || (cs.position === "absolute" && r.width <= 1)) continue;
      const bg = bgOf(el);
      const fg = over(parse(cs.color), bg);
      const L1 = lum(fg);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      n++;
      if (ratio < 4.5) bad.push(`${t.textContent.trim().slice(0, 18)} ${ratio.toFixed(2)}`);
    }
    return { n, bad };
  };
  await gate(
    222,
    "go 45f: every text node >= 4.5:1, computed",
    async (browser, vp) => {
      const out = [];
      let ok = true;
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      const take = async (label) => {
        await page.waitForTimeout(650);
        const r = await page.evaluate(CONTRAST);
        ok &&= r.bad.length === 0 && r.n > 0;
        out.push(`${label} ${r.n} nodes${r.bad.length ? " LOW " + JSON.stringify(r.bad.slice(0, 3)) : ""}`);
      };
      await page.goto(url(`biz=${encodeURIComponent(BIZ)}&trade=hvac`), { waitUntil: "networkidle" });
      await take("live");
      await page.goto(url(bizQ), { waitUntil: "networkidle" });
      await take("demo");
      await page.click("[data-go-slot=book]");
      await page.waitForSelector("[data-go-job]");
      await take("job");
      await page.click("[data-go-job] >> nth=0");
      await page.waitForSelector("[data-go-time]");
      await take("time");
      await page.click("[data-go-fast]");
      await page.click("[data-go-confirm]");
      await take("you+errors");
      await page.fill("[data-go-field=name]", "Pat Doe");
      await page.fill("[data-go-field=phone]", "8045550142");
      await page.click("[data-go-confirm]");
      await page.waitForSelector("[data-go-done]");
      await page.waitForTimeout(1600);
      await take("done");
      await ctx.close();
      return { ok, detail: out.join("; ") };
    },
    { viewports: V2 },
  );

  /* --- 223 (45g): one drawn glyph per job, every job set (the five home
         trades, salon, dental, other): each chip carries an SVG whose
         shapes have real geometry. A key with no drawing renders nothing,
         so a missing glyph is red here. --- */
  await gate(
    223,
    "go 45g: every job of every preset carries the drawn glyph its own string maps to",
    async (browser, vp) => {
      const sets = [
        ["plumbing", "preset=home&trade=plumbing&demo=1"],
        ["hvac", "preset=home&trade=hvac&demo=1"],
        ["electrical", "preset=home&trade=electrical&demo=1"],
        ["roofing", "preset=home&trade=roofing&demo=1"],
        ["garage", "preset=home&trade=garage&demo=1"],
        ["salon", "preset=salon&demo=1"],
        ["dental", "preset=dental&demo=1"],
        ["other", "preset=other&demo=1"],
      ];
      const out = [];
      let ok = true;
      const ctx = await ctxFor(browser, vp);
      const page = await ctx.newPage();
      for (const [set, q] of sets) {
        await page.goto(url(q), { waitUntil: "networkidle" });
        await page.click("[data-go-slot=book]");
        await page.waitForSelector("[data-go-job]");
        const chips = await page.evaluate(() =>
          [...document.querySelectorAll("[data-go-job]")].map((b) => {
            const svg = b.querySelector("svg[data-go-job-glyph]");
            const shapes = svg ? [...svg.querySelectorAll("path, circle, rect, line")] : [];
            const drawn = shapes.filter((sh) => {
              const bb = sh.getBBox();
              return bb.width + bb.height > 1;
            }).length;
            return { label: b.textContent.trim(), key: svg?.getAttribute("data-go-job-glyph") ?? null, drawn };
          }),
        );
        const want = X.jobs[set] ?? [];
        const missing = chips.filter((c) => !c.key || c.drawn === 0).map((c) => c.label);
        /* change 45.1: each chip carries the glyph config assigns to ITS
           string — whatever order the list is in. */
        const wrong = chips.filter((c) => c.key && c.key !== X.jobGlyph[c.label]).map((c) => `${c.label}=${c.key} want ${X.jobGlyph[c.label]}`);
        const good = chips.length === want.length && chips.every((c, i) => c.label === want[i]) && missing.length === 0 && wrong.length === 0;
        ok &&= good;
        out.push(`${set} ${chips.length}/${want.length}${missing.length ? " MISSING " + JSON.stringify(missing) : ""}${wrong.length ? " WRONG " + JSON.stringify(wrong.slice(0, 2)) : ""}`);
      }
      await ctx.close();
      return { ok, detail: out.join("; ") };
    },
    { viewports: V2 },
  );

  /* --- 225 (change 45.1): a LIVE door (no demo=1) claims nothing it cannot
         back: no proof row, and the booking / quote endings are the page's
         own Text us and Call actions — never "You're booked." or "Photo
         sent.". The demo door keeps both, so this is a mode switch, not a
         deletion. --- */
  await gate(
    225,
    "go: a live door shows no proof row and ends bookings and quotes on Text / Call, not confirmations",
    async (browser, vp) => {
      const ending = async (q) => {
        const ctx = await ctxFor(browser, vp, { userAgent: ANDROID_UA });
        const page = await ctx.newPage();
        await page.goto(url(q), { waitUntil: "networkidle" });
        const proof = await page.evaluate(() => !!document.querySelector("[data-go-proof]"));
        await book(page);
        const bookEnd = await page.evaluate(() => {
          const panel = document.querySelector("[data-go-panel]");
          return {
            text: panel.textContent,
            live: [...panel.querySelectorAll("[data-go-live]")].map((a) => [a.getAttribute("data-go-live"), a.getAttribute("href")]),
          };
        });
        await page.click("[data-go-close]");
        await page.waitForFunction(() => document.querySelector("[data-go-sheet]")?.getAttribute("data-go-sheet") === "closed");
        await page.click("[data-go-slot=quote]");
        await page.setInputFiles("[data-go-photo]", { name: "p.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
        await page.click("[data-go-send]");
        await page.waitForSelector("[data-go-quote-done]");
        const quoteEnd = await page.evaluate(() => {
          const panel = document.querySelector("[data-go-panel]");
          return { text: panel.textContent, live: [...panel.querySelectorAll("[data-go-live]")].map((a) => [a.getAttribute("data-go-live"), a.getAttribute("href")]) };
        });
        await ctx.close();
        return { proof, bookEnd, quoteEnd };
      };
      const smsWant = `${X.smsHref}?body=${encodeURIComponent(X.smsBody.replace(/\{biz\}/g, BIZ))}`;
      const liveLinks = (e) => JSON.stringify(e.live) === JSON.stringify([["text", smsWant], ["call", X.goTel]]);
      const live = await ending(`biz=${encodeURIComponent(BIZ)}&trade=hvac`);
      const demo = await ending(bizQ);
      const checks = {
        liveNoProof: !live.proof,
        liveNoBooked: !live.bookEnd.text.includes(X.doneTitle) && liveLinks(live.bookEnd),
        liveNoSent: !live.quoteEnd.text.includes(X.quoteDoneTitle) && liveLinks(live.quoteEnd),
        demoProof: demo.proof,
        demoBooked: demo.bookEnd.text.includes(X.doneTitle) && demo.bookEnd.live.length === 0,
        demoSent: demo.quoteEnd.text.includes(X.quoteDoneTitle) && demo.quoteEnd.live.length === 0,
      };
      const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return {
        ok: bad.length === 0,
        detail: `live: proof ${live.proof ? "SHOWN" : "none"}, booking ends ${live.bookEnd.text.includes(X.doneTitle) ? "CONFIRMED" : "on " + live.bookEnd.live.map((x) => x[0]).join("+")}, quote ends ${live.quoteEnd.text.includes(X.quoteDoneTitle) ? "CONFIRMED" : "on " + live.quoteEnd.live.map((x) => x[0]).join("+")}; demo: proof ${demo.proof}, booked ${demo.bookEnd.text.includes(X.doneTitle)}, sent ${demo.quoteEnd.text.includes(X.quoteDoneTitle)}${bad.length ? " | RED " + bad.join(",") : ""}`,
      };
    },
    { viewports: [{ width: 390, height: 844 }] },
  );

  /* --- 224 (change 45 review): the plumbing nobody sees — the analytics
         events and their attribution, the per-business manifest and its
         icon, and the install hint on iOS Safari only. --- */
  await gate(
    224,
    "go: analytics events, manifest, icon, install hint",
    async (browser, vp) => {
      const out = [];
      let ok = true;
      const q = `${bizQ}&ref=lead&lead=17`;
      const ctx = await ctxFor(browser, vp, { userAgent: IOS_UA });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__goEvents = [];
        window.__track = (name, data) => window.__goEvents.push([name, data]);
      });
      await page.goto(url(q), { waitUntil: "networkidle" });
      const hint = await page.evaluate(() => {
        const h = document.querySelector("[data-go-install]");
        return h && h.getClientRects().length > 0 ? h.textContent.trim() : null;
      });
      await book(page);
      await page.click("[data-go-close]");
      await page.waitForFunction(() => document.querySelector("[data-go-sheet]")?.getAttribute("data-go-sheet") === "closed");
      await page.click("[data-go-slot=quote]");
      await page.setInputFiles("[data-go-photo]", { name: "p.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
      await page.click("[data-go-send]");
      await page.waitForSelector("[data-go-quote-done]");
      const ev = await page.evaluate(() => window.__goEvents);
      const seq = ev.map(([n, d]) => (n === "go_tap" ? `go_tap:${d.slot}` : n));
      const want = ["go_view", "go_tap:book", "go_book_done", "go_tap:quote", "go_quote_done"];
      const attributed = ev.every(([, d]) => d.preset === "home" && d.ref === "lead" && d.lead === "17");
      const evOk = JSON.stringify(seq) === JSON.stringify(want) && attributed;
      ok &&= evOk;
      out.push(`events ${evOk ? "ok" : JSON.stringify(seq) + " attributed " + attributed}`);

      const href = await page.getAttribute('link[rel="manifest"]', "href");
      const man = href ? await (await fetch(new URL(href, base))).json() : null;
      const manOk =
        !!man && man.name === BIZ && man.theme_color === "#060B14" && man.background_color === "#060B14" && man.display === "standalone" &&
        /[?&]ref=lead\b/.test(man.start_url) && /[?&]lead=17\b/.test(man.start_url) && man.icons?.length === 2;
      ok &&= manOk;
      out.push(`manifest ${manOk ? "ok" : JSON.stringify(man).slice(0, 160)}`);
      const icon = man?.icons?.[0] ? await fetch(new URL(man.icons[0].src, base)) : null;
      const buf = icon ? Buffer.from(await icon.arrayBuffer()) : Buffer.alloc(0);
      const iconOk = !!icon && icon.headers.get("content-type") === "image/png" && buf.readUInt32BE(16) === 192 && buf.readUInt32BE(20) === 192;
      ok &&= iconOk;
      out.push(`icon ${iconOk ? "192x192 png" : "RED"}`);
      const hintOk = hint === X.installHint;
      ok &&= hintOk;
      out.push(`ios hint ${hintOk ? "ok" : JSON.stringify(hint)}`);
      await ctx.close();
      /* No hint inside the Facebook browser: only Safari can add to the home screen. */
      const fb = await ctxFor(browser, vp, { userAgent: FB_UA });
      const fp = await fb.newPage();
      await fp.goto(url(q), { waitUntil: "networkidle" });
      const fbHint = await fp.evaluate(() => !!document.querySelector("[data-go-install]"));
      await fb.close();
      ok &&= !fbHint;
      out.push(`fb hint ${fbHint ? "SHOWN" : "absent"}`);
      return { ok, detail: out.join("; ") };
    },
    { viewports: [{ width: 390, height: 844 }] },
  );

  for (const { browser } of engines) await browser.close();
}

/* Standalone. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const pw = createRequire(import.meta.url)("playwright");
  const results = [];
  await runGoGates({ base, pw, check: (n, name, pass, detail) => results.push({ n, name, pass, detail }) });
  if (process.env.GO_ONLY) console.log(`  (filtered: GO_ONLY=${process.env.GO_ONLY})`);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} GO GATE(S) RED: ${failed.map((r) => r.n).join(", ")}` : `\nALL ${results.length} GO GATES PASS`);
  process.exitCode = failed.length ? 1 : 0;
}
