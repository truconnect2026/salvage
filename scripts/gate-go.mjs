/*
 * change 42: the /go gates, 207-212.  Run by scripts/gate.mjs after its own
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
  };
}

const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const etWeekday = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(ms);
const etTime = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(ms);
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
  const gate = async (n, name, fn, { viewports = VIEWPORTS } = {}) => {
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

  /* --- 212: demo done = owner card + the STORED ticket --- */
  await gate(212, "go: demo done shows owner card and +ticket", async (browser, vp) => {
    const ctx = await ctxFor(browser, vp);
    const page = await ctx.newPage();
    await page.goto(url(bizQ), { waitUntil: "networkidle" });
    await book(page);
    await page.waitForTimeout(1700);
    const demo = await page.evaluate(() => {
      const owner = document.querySelector("[data-go-owner]");
      const n = document.querySelector("[data-go-notify]");
      const t = document.querySelector("[data-go-ticket]");
      const cs = n ? getComputedStyle(n) : null;
      return {
        owner: !!owner && owner.getClientRects().length > 0,
        notify: n?.textContent ?? "",
        landed: !!cs && cs.opacity === "1" && cs.transform === "none",
        ticket: t?.textContent.trim() ?? null,
        tColor: t ? getComputedStyle(t).color : null,
      };
    });
    await page.goto(url(`biz=${encodeURIComponent(BIZ)}&trade=hvac`), { waitUntil: "networkidle" });
    await book(page);
    const live = await page.evaluate(() => !!document.querySelector("[data-go-owner]"));
    await ctx.close();
    const want = `+${usd(X.homeTicket)}`;
    const ok = demo.owner && demo.notify.includes(X.bookedLabel) && demo.landed && demo.ticket === want && !live;
    return {
      ok,
      detail: `owner ${demo.owner}, "${X.bookedLabel}" ${demo.notify.includes(X.bookedLabel)}, landed ${demo.landed}, ticket ${JSON.stringify(demo.ticket)} want ${want} (stored; recovered is ${X.homeRecovered}); live mode owner ${live}`,
    };
  });

  for (const { browser } of engines) await browser.close();
}

/* Standalone. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const pw = createRequire(import.meta.url)("playwright");
  const results = [];
  await runGoGates({ base, pw, check: (n, name, pass, detail) => results.push({ n, name, pass, detail }) });
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} GO GATE(S) RED: ${failed.map((r) => r.n).join(", ")}` : `\nALL ${results.length} GO GATES PASS`);
  process.exitCode = failed.length ? 1 : 0;
}
