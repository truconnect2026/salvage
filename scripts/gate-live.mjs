/*
 * change 50: Salvage Live, gates 250-259.  Run by scripts/gate.mjs, or alone:
 *
 *   NODE_PATH=<playwright>/node_modules node scripts/gate-live.mjs
 *
 * The real routes (app/api/voice, app/api/sms, app/api/start, /start,
 * /privacy, /terms) run in a `next start` of the CURRENT build on its own
 * port, against two in-process doubles: scripts/upstash-stub.mjs for the
 * store and a mock Twilio REST API that records every message. The child's
 * environment carries ONLY gate credentials — TWILIO_API_BASE points at the
 * mock — so no gate can ever reach real Twilio or a real store. The child is
 * stopped by its own PID (tree), never by name.
 *
 *   250 a bad or missing X-Twilio-Signature -> 403, voice and sms
 *   251 a missed call -> exactly ONE text, from the client's number, to the
 *       caller, the approved template with the client's biz and link
 *   252 a second call inside 12h -> no text; another caller still gets one
 *   253 STOP -> no further text (a call after it sends nothing); START opts back in
 *   254 a caller's reply -> the owner's cell, prefixed with the caller's
 *       number; the owner's reply routes back (plain -> last caller;
 *       "<number>: ..." -> that number)
 *   255 an unknown To -> no text, and the call/text is logged
 *   256 /start: the biz, the four approved price lines and the approved
 *       agreement verbatim; "Pay $250 and start" is inert until "I agree",
 *       then links to STRIPE_START_URL (with client_reference_id) — with JS
 *       and without, Chromium and WebKit
 *   257 /api/start stores a valid submission and texts Andy once; an invalid
 *       one stores nothing and texts nothing; the honeypot stores nothing
 *   258 /privacy and /terms answer 200, and /go and /start link to both
 *   259 / shows the four approved price lines; no old price anywhere
 */
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { startUpstashStub } from "./upstash-stub.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.LIVE_PORT ?? 3101);
const BASE = `http://localhost:${PORT}`;
const AUTH = "gate-auth-token";
const SID = "ACgate00000000000000000000000000";
const STRIPE = "https://buy.stripe.com/test_gate_link";

/* ---------- expectations, from the config TEXT ---------------------------- */
function expectations(src) {
  /* Each COPY block is read on its own, so a common key name elsewhere in
     the file can never answer for it. */
  const block = (head) => {
    const i = src.indexOf(`\n  ${head}: {`);
    if (i < 0) throw new Error(`gate-live setup: no COPY.${head} block`);
    return src.slice(i, src.indexOf("\n  },", i));
  };
  const STR = String.raw`\s*"((?:[^"\\]|\\.)*)"`;
  const str = (text, key, label) => {
    const m = text.match(new RegExp(String.raw`\b` + key + ":" + STR));
    if (!m) throw new Error(`gate-live setup: could not read ${label}`);
    return JSON.parse(`"${m[1]}"`);
  };
  const price = block("price");
  const live = block("live");
  const start = block("start");
  const dl = src.match(/export const DEMO_LINE = "([^"]+)"/);
  if (!dl) throw new Error("gate-live setup: could not read DEMO_LINE");
  return {
    missedText: str(live, "missedText", "COPY.live.missedText"),
    forward: str(live, "forward", "COPY.live.forward"),
    price: ["line", "monthly", "guarantee", "founding"].map((k) => str(price, k, `COPY.price.${k}`)),
    agreement: str(start, "agreement", "COPY.start.agreement"),
    agree: str(start, "agree", "COPY.start.agree"),
    pay: str(start, "pay", "COPY.start.pay"),
    alert: str(start, "alert", "COPY.start.alert"),
    demoLine: dl[1],
  };
}
export { expectations };
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const progress = (what) => console.error(`[gate-live ${new Date().toISOString().slice(11, 19)}] ${what}`);

/* ---------- the mock Twilio ------------------------------------------------ */
function startTwilioMock() {
  const sent = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const m = req.url.match(/^\/2010-04-01\/Accounts\/([^/]+)\/Messages\.json$/);
      const auth = req.headers.authorization ?? "";
      if (req.method !== "POST" || !m || auth !== `Basic ${Buffer.from(`${SID}:${AUTH}`).toString("base64")}`) {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ code: 20003 }));
      }
      const p = Object.fromEntries(new URLSearchParams(body));
      sent.push({ from: p.From, to: p.To, body: p.Body });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ sid: `SM${sent.length}` }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, sent, close: () => new Promise((r) => server.close(r)) })),
  );
}

/* ---------- the app under test --------------------------------------------- */
async function startApp(env) {
  const next = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/privacy`);
      if (r.status === 200) return { child, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app did not start on ${PORT}: ${log.slice(-300)}`);
}
function stopApp(child) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const k = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      k.on("exit", () => resolve());
    } else {
      child.kill("SIGTERM");
      child.on("exit", () => resolve());
    }
  });
}

/* A webhook POST, signed as Twilio signs it (or not). */
async function hook(path, params, sign = "good") {
  const url = `${BASE}${path}`;
  const data = Object.keys(params).sort().reduce((a, k) => a + k + params[k], url);
  const sig = createHmac("sha1", sign === "badkey" ? "wrong-token" : AUTH).update(data).digest("base64");
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (sign !== "none") headers["x-twilio-signature"] = sign === "tampered" ? sig.replace(/^./, (c) => (c === "A" ? "B" : "A")) : sig;
  const r = await fetch(url, { method: "POST", headers, body: new URLSearchParams(params).toString() });
  return { status: r.status, text: await r.text() };
}

export async function runLiveGates({ pw, check }) {
  const X = expectations(readFileSync(join(ROOT, "lib", "client.config.ts"), "utf8"));
  const only = (process.env.LIVE_ONLY ?? "").split(",").map(Number).filter(Boolean);
  const want = (n) => only.length === 0 || only.includes(n);
  progress("stubs");
  const store = await startUpstashStub();
  const twilio = await startTwilioMock();
  const app = await startApp({
    UPSTASH_REDIS_REST_URL: store.url,
    UPSTASH_REDIS_REST_TOKEN: "gate",
    TWILIO_ACCOUNT_SID: SID,
    TWILIO_AUTH_TOKEN: AUTH,
    TWILIO_API_BASE: twilio.url,
    STRIPE_START_URL: STRIPE,
    SALVAGE_PUBLIC_ORIGIN: "",
  });
  progress("app up");
  const db = store.store;
  const CLIENT = {
    twilioNumber: "+18045550100",
    biz: "Robinson's Heating & Air",
    trade: "hvac",
    ownerCell: "+18045550199",
    goUrl: "https://salvage.davyjoneslocker.app/go?biz=Robinson%27s%20Heating%20%26%20Air&preset=home&trade=hvac",
  };
  const DEMO = { twilioNumber: X.demoLine, biz: "Davy Jones' Locker", trade: "", ownerCell: "+17578073318", goUrl: "https://salvage.davyjoneslocker.app/go?demo=1" };
  db.run(["SET", `salvage:client:${CLIENT.twilioNumber}`, JSON.stringify(CLIENT)]);
  db.run(["SET", `salvage:client:${DEMO.twilioNumber}`, JSON.stringify(DEMO)]);
  const call = (from, to = CLIENT.twilioNumber, sign) => hook("/api/voice", { CallSid: `CA${Math.random().toString(36).slice(2)}`, From: from, To: to, CallStatus: "ringing", Direction: "inbound" }, sign);
  const text = (from, body, to = CLIENT.twilioNumber, sign) => hook("/api/sms", { MessageSid: `SM${Math.random().toString(36).slice(2)}`, From: from, To: to, Body: body }, sign);
  const since = (n) => twilio.sent.slice(n);
  /* A gate that throws is red with the reason — never a crash that takes
     the other gates with it. */
  const threw = (nums, err) => {
    for (const n of nums) if (want(n)) check(n, `live gate ${n}`, false, `THREW: ${String(err.message).split(/\r?\n/)[0].slice(0, 200)}`);
  };

  try {
    if (want(250)) {
      try {
        progress("gate 250");
        const rows = [];
        for (const path of ["voice", "sms"]) {
          for (const sign of ["none", "badkey", "tampered", "good"]) {
            const n = twilio.sent.length;
            const r = await (path === "voice" ? call("+18045551001", CLIENT.twilioNumber, sign) : text("+18045551001", "hi", CLIENT.twilioNumber, sign));
            rows.push({ path, sign, status: r.status, texts: twilio.sent.length - n });
          }
        }
        const ok = rows.every((r) => (r.sign === "good" ? r.status === 200 : r.status === 403 && r.texts === 0));
        check(250, "50: a bad or missing X-Twilio-Signature -> 403, voice and sms (and nothing sent)", ok, rows.map((r) => `${r.path}/${r.sign} ${r.status}${r.texts ? ` +${r.texts} text` : ""}`).join(", "));
        twilio.sent.length = 0;
        db.strings.forEach((_, k) => k.startsWith("salvage:dedupe:") && db.strings.delete(k));
        db.strings.delete(`salvage:last:${CLIENT.twilioNumber}`);
      } catch (err) {
        threw([250], err);
      }
    }

    if (want(251) || want(252)) {
      try {
        progress("gate 251");
        const n = twilio.sent.length;
        const r = await call("+18045552001");
        const first = since(n);
        const body = fill(X.missedText, { biz: CLIENT.biz, go_url: CLIENT.goUrl });
        const twimlOk = /<Response><Pause length="1"\/><Hangup\/><\/Response>/.test(r.text);
        if (want(251)) {
          const ok = r.status === 200 && twimlOk && first.length === 1 && first[0].from === CLIENT.twilioNumber && first[0].to === "+18045552001" && first[0].body === body;
          check(251, "50: a missed call -> exactly one text, from the client's number, to the caller, the approved template filled", ok, `${r.status}, TwiML pause-1+hangup ${twimlOk}; ${first.length} text(s): ${JSON.stringify(first[0] ?? null)} (need body ${JSON.stringify(body)})`);
        }
        if (want(252)) {
          const n2 = twilio.sent.length;
          await call("+18045552001");
          await call("(804) 555-2001");
          const again = since(n2).length;
          const n3 = twilio.sent.length;
          await call("+18045552002");
          const other = since(n3).length;
          const ttl = db.run(["TTL", `salvage:dedupe:${CLIENT.twilioNumber}:+18045552001`]);
          const ok = again === 0 && other === 1 && ttl > 12 * 3600 - 60 && ttl <= 12 * 3600;
          check(252, "50: a second call inside 12h -> no text (any number format); another caller still gets one", ok, `repeat calls sent ${again} (need 0), new caller ${other} (need 1), de-dupe TTL ${ttl}s (need ~43200)`);
        }
      } catch (err) {
        threw([251, 252], err);
      }
    }

    if (want(253)) {
      try {
        progress("gate 253");
        const who = "+18045553001";
        const rows = [];
        for (const word of ["STOP", "stop", " Stop. "]) {
          const n = twilio.sent.length;
          await text(who, word);
          await call(who);
          rows.push(`${JSON.stringify(word)} -> ${since(n).length}`);
        }
        const stopped = rows.every((r) => r.endsWith("-> 0"));
        const n = twilio.sent.length;
        await text(who, "START");
        await call(who);
        const back = since(n).filter((m) => m.to === who).length;
        const member = db.run(["SISMEMBER", `salvage:optout:${CLIENT.twilioNumber}`, who]);
        check(253, "50: STOP -> no further text from that number; START opts back in", stopped && back === 1 && member === 0, `${rows.join(", ")} (need 0 each); after START a call sent ${back} (need 1); opted out now ${member}`);
      } catch (err) {
        threw([253], err);
      }
    }

    if (want(254)) {
      try {
        progress("gate 254");
        const caller = "+18045554001";
        await call(caller);
        let n = twilio.sent.length;
        await text(caller, "Can you come Tuesday?");
        const fwd = since(n);
        n = twilio.sent.length;
        await text(CLIENT.ownerCell, "Yes, 10am works.");
        const plain = since(n);
        n = twilio.sent.length;
        await text(CLIENT.ownerCell, "(804) 555-4002: On my way.");
        const addressed = since(n);
        n = twilio.sent.length;
        await text("+18045554003", "Yes");
        const yes = since(n);
        const wantFwd = fill(X.forward, { from: caller, body: "Can you come Tuesday?" });
        const ok =
          fwd.length === 1 && fwd[0].to === CLIENT.ownerCell && fwd[0].from === CLIENT.twilioNumber && fwd[0].body === wantFwd &&
          plain.length === 1 && plain[0].to === caller && plain[0].body === "Yes, 10am works." &&
          addressed.length === 1 && addressed[0].to === "+18045554002" && addressed[0].body === "On my way." &&
          yes.length === 1 && yes[0].to === CLIENT.ownerCell;
        check(254, "50: a caller's reply -> the owner's cell, prefixed with the caller's number; the owner's reply routes back", ok, `forward ${JSON.stringify(fwd)} (need to owner, ${JSON.stringify(wantFwd)}); owner plain -> ${JSON.stringify(plain.map((m) => m.to))} (need ${caller}); owner addressed -> ${JSON.stringify(addressed.map((m) => [m.to, m.body]))}; a bare "Yes" -> ${JSON.stringify(yes.map((m) => m.to))} (need the owner)`);
      } catch (err) {
        threw([254], err);
      }
    }

    if (want(255)) {
      try {
        progress("gate 255");
        const before = (db.lists.get("salvage:log:unknown") ?? []).length;
        const n = twilio.sent.length;
        const r1 = await call("+18045555001", "+18045559999");
        const r2 = await text("+18045555001", "hello?", "+18045559999");
        const logged = (db.lists.get("salvage:log:unknown") ?? []).slice(0, 2).map((l) => JSON.parse(l));
        const ok = r1.status === 200 && r2.status === 200 && since(n).length === 0 && (db.lists.get("salvage:log:unknown") ?? []).length === before + 2 && logged.every((l) => l.to === "+18045559999" && !String(l.from).includes("5555001"));
        check(255, "50: an unknown To -> no text, and the call and the text are logged (caller masked)", ok, `${since(n).length} text(s) (need 0); log +${(db.lists.get("salvage:log:unknown") ?? []).length - before} ${JSON.stringify(logged)}`);
      } catch (err) {
        threw([255], err);
      }
    }

    if (want(256) && pw) {
      try {
        progress("gate 256");
        const notes = [];
        let ok = true;
        const q = `/start?biz=${encodeURIComponent(CLIENT.biz)}&trade=hvac`;
        const ref = "robinson-s-heating-air";
        for (const eng of ["chromium", "webkit"]) {
          const browser = await pw[eng].launch();
          for (const js of [true, false]) {
            const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: js });
            const page = await ctx.newPage();
            /* Stripe is never reached from a gate: a click that gets through
               lands on this stub (and is red). */
            await ctx.route("https://buy.stripe.com/**", (r) => r.fulfill({ status: 200, contentType: "text/plain", body: "stripe (gate stub)" }));
            await page.goto(BASE + q, { waitUntil: "load" });
            const read = () =>
              page.evaluate(() => {
                const a = document.querySelector("[data-pay]");
                return {
                  biz: document.querySelector("[data-start-biz]")?.textContent.trim(),
                  prices: [...document.querySelectorAll("[data-start-price]")].map((p) => p.textContent.trim()),
                  agreement: document.querySelector("[data-start-agreement]")?.textContent.trim(),
                  pay: a?.textContent.trim(),
                  href: a?.getAttribute("href"),
                  pe: a ? getComputedStyle(a).pointerEvents : null,
                  disabled: a?.getAttribute("aria-disabled"),
                };
              });
            const before = await read();
            const startUrl = page.url();
            await page.click("[data-pay]", { force: true, timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(300);
            const stayed = page.url() === startUrl;
            if (!stayed) await page.goto(BASE + q, { waitUntil: "load" });
            await page.check("[data-agree]");
            await page.waitForTimeout(150);
            const after = await read();
            const pass =
              before.biz === CLIENT.biz &&
              JSON.stringify(before.prices) === JSON.stringify(X.price) &&
              before.agreement === X.agreement &&
              before.pay === X.pay &&
              before.pe === "none" &&
              stayed &&
              after.pe !== "none" &&
              (js ? after.disabled === "false" : true) &&
              after.href === `${STRIPE}?client_reference_id=${ref}`;
            ok &&= pass;
            notes.push(`${eng}${js ? "" : " no-JS"} ${pass ? "ok" : "RED"}: before pe ${before.pe}/aria ${before.disabled}, click stayed ${stayed}; after pe ${after.pe}/aria ${after.disabled}, href ${after.href}${pass ? "" : `; biz ${JSON.stringify(before.biz)} prices ${JSON.stringify(before.prices)} agreement ${before.agreement === X.agreement}`}`);
            await ctx.close();
          }
          await browser.close();
        }
        check(256, `50: /start shows the biz, the four price lines and the agreement verbatim; "${X.pay}" is inert until "${X.agree}", then links to STRIPE_START_URL`, ok, notes.join(" | "));
      } catch (err) {
        threw([256], err);
      }
    }

    if (want(257)) {
      try {
        progress("gate 257");
        const post = async (fields) => {
          const r = await fetch(`${BASE}/api/start`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200) + 1}` }, body: new URLSearchParams(fields).toString() });
          return { status: r.status, body: await r.json().catch(() => null) };
        };
        /* hasEin is the yes/no; a stray "ein" a client might post must go nowhere. */
        const good = { biz: CLIENT.biz, trade: "hvac", legalName: "Robinson HVAC LLC", ownerCell: "(804) 555-7001", carrier: "verizon", businessPhone: "804-555-7002", website: "robinsonhvac.com", hasEin: "yes", ein: "12-3456789", company_url: "" };
        const listLen = () => (db.lists.get("salvage:starts") ?? []).length;
        let n = twilio.sent.length;
        let l = listLen();
        const r1 = await post(good);
        const stored = listLen() - l;
        const rec = JSON.parse((db.lists.get("salvage:starts") ?? ["{}"])[0]);
        const alerts = since(n);
        const wantAlert = fill(X.alert, { legalName: "Robinson HVAC LLC", biz: CLIENT.biz, ownerCell: "+18045557001", carrier: "Verizon", businessPhone: "+18045557002", website: "robinsonhvac.com", ein: "yes" });
        const noEin = !JSON.stringify(db.lists.get("salvage:starts") ?? []).match(/3456789|12-3/) && !alerts.some((a) => /3456789/.test(a.body));
        n = twilio.sent.length;
        l = listLen();
        const r2 = await post({ ...good, ownerCell: "555-7001", hasEin: "maybe" });
        const badStored = listLen() - l;
        const badTexts = since(n).length;
        n = twilio.sent.length;
        l = listLen();
        const r3 = await post({ ...good, company_url: "http://spam.example" });
        const potStored = listLen() - l;
        const potTexts = since(n).length;
        const ok =
          r1.status === 200 && stored === 1 && rec.legalName === "Robinson HVAC LLC" && rec.ownerCell === "+18045557001" && rec.hasEin === "yes" && !("ein" in rec) && noEin &&
          alerts.length === 1 && alerts[0].from === X.demoLine && alerts[0].to === DEMO.ownerCell && alerts[0].body === wantAlert &&
          r2.status === 400 && JSON.stringify(r2.body?.fields) === JSON.stringify(["ownerCell", "hasEin"]) && badStored === 0 && badTexts === 0 &&
          r3.status === 200 && potStored === 0 && potTexts === 0;
        check(257, "50: /api/start stores a valid submission (EIN yes/no only — no EIN anywhere) and texts Andy once; invalid or honeypot: nothing stored, nothing sent", ok, `valid ${r1.status} stored ${stored}, hasEin ${rec.hasEin}, EIN anywhere ${!noEin}, alert ${JSON.stringify(alerts.map((a) => [a.from, a.to, a.body === wantAlert]))}; invalid ${r2.status} fields ${JSON.stringify(r2.body?.fields)} stored ${badStored} texts ${badTexts}; honeypot ${r3.status} stored ${potStored} texts ${potTexts}`);
      } catch (err) {
        threw([257], err);
      }
    }

    if (want(258)) {
      try {
        progress("gate 258");
        const page = async (p) => {
          const r = await fetch(BASE + p);
          return { status: r.status, html: await r.text() };
        };
        const priv = await page("/privacy");
        const terms = await page("/terms");
        /* The links as a visitor meets them: rendered, visible, on the page. */
        const visible = {};
        if (pw) {
          const browser = await pw.chromium.launch();
          const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
          const pg = await ctx.newPage();
          for (const [name, path] of [
            ["/go demo", `/go?biz=${encodeURIComponent(CLIENT.biz)}&trade=hvac&demo=1`],
            ["/go live", `/go?biz=${encodeURIComponent(CLIENT.biz)}&trade=hvac`],
            ["/start", "/start?biz=x"],
          ]) {
            await pg.goto(BASE + path, { waitUntil: "load" });
            visible[name] = await pg.evaluate(() =>
              ["/privacy", "/terms"].every((h) =>
                [...document.querySelectorAll(`a[href="${h}"]`)].some((a) => {
                  const r = a.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== "hidden" && a.getClientRects().length > 0;
                }),
              ),
            );
          }
          await browser.close();
        }
        const shown = Object.values(visible);
        const ok = priv.status === 200 && terms.status === 200 && /<h1[^>]*>Privacy</.test(priv.html) && /<h1[^>]*>Terms</.test(terms.html) && shown.length === 3 && shown.every(Boolean);
        check(258, "50: /privacy and /terms answer 200; every /go door (demo and live) and /start show links to both", ok, `privacy ${priv.status}, terms ${terms.status}; visible links: ${JSON.stringify(visible)}`);
      } catch (err) {
        threw([258], err);
      }
    }

    if (want(259)) {
      try {
        progress("gate 259");
        const r = await fetch(BASE + "/?biz=home");
        const html = await r.text();
        const lines = [...html.matchAll(/<p[^>]*data-price-line[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").trim());
        const stale = ["$1,000", "$500 to start", "$500 at delivery", "$100 a month after"].filter((s) => html.includes(s));
        const ok = JSON.stringify(lines) === JSON.stringify(X.price) && stale.length === 0;
        check(259, "50: / (\"The math\") shows the four approved price lines; no old price anywhere on the page", ok, `lines ${JSON.stringify(lines)} (need ${JSON.stringify(X.price)}); stale ${JSON.stringify(stale)}`);
      } catch (err) {
        threw([259], err);
      }
    }
  } finally {
    progress("stopping app");
    await stopApp(app.child);
    progress("closing stubs");
    await twilio.close();
    await store.close();
    progress("done");
  }
}

/* Standalone. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pw = null;
  try {
    pw = createRequire(import.meta.url)("playwright");
  } catch {}
  const results = [];
  await runLiveGates({ pw, check: (n, name, pass, detail) => results.push({ n, name, pass, detail }) });
  if (process.env.LIVE_ONLY) console.log(`  (filtered: LIVE_ONLY=${process.env.LIVE_ONLY})`);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} LIVE GATE(S) RED: ${failed.map((r) => r.n).join(", ")}` : `\nALL ${results.length} LIVE GATES PASS`);
  process.exitCode = failed.length ? 1 : 0;
}
