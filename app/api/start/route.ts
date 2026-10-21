import { DEMO_LINE, LIVE_COPY } from "@/lib/client.config";
import { clientFor, fillTemplate } from "@/lib/live/clients";
import { KEY, redis } from "@/lib/live/redis";
import { e164, sendSms } from "@/lib/live/twilio";

/*
 * change 50: the /start onboarding form. A submission is validated, stored
 * in Upstash (the last 500), and texted to Andy from the demo line (client
 * #0's number, to its owner cell). No EIN is ever asked for, stored or
 * sent — only whether there is one. The form is plain HTML: without JS it
 * posts here and lands back on /start with a result; with JS the same.
 * A hidden honeypot field and a per-IP hourly cap keep bots out.
 */
const CARRIERS = ["verizon", "att", "tmobile", "other"] as const;
const PER_HOUR = 5;

export type StartRecord = {
  at: string;
  biz: string;
  trade: string;
  legalName: string;
  ownerCell: string;
  carrier: (typeof CARRIERS)[number];
  businessPhone: string;
  website: string;
  /* Andy's veto: whether the business HAS an EIN — never the number. */
  hasEin: "yes" | "no";
};

function website(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  if (t.length > 200 || /\s/.test(t) || !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return null;
  return t;
}

function back(request: Request, biz: string, trade: string, result: string): Response {
  const u = new URL("/start", request.url);
  if (biz) u.searchParams.set("biz", biz);
  if (trade) u.searchParams.set("trade", trade);
  u.searchParams.set(result.startsWith("error") ? "error" : "sent", result.startsWith("error") ? result.slice(6) : "1");
  return Response.redirect(u, 303);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const f = (k: string) => String(form.get(k) ?? "").trim();
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  const biz = f("biz").slice(0, 80);
  const trade = f("trade").slice(0, 24);
  const reply = (status: number, result: string, fields: string[] = []) =>
    wantsHtml ? back(request, biz, trade, result) : Response.json({ ok: status === 200, fields }, { status });

  /* A bot fills the field no person can see. */
  if (f("company_url")) return reply(200, "ok");

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  try {
    const n = Number(await redis(["INCR", KEY.startRate(ip)]));
    if (n === 1) await redis(["EXPIRE", KEY.startRate(ip), 3600]);
    if (n > PER_HOUR) return reply(429, "error:rate");
  } catch (err) {
    console.error(`salvage-start: rate check failed: ${String((err as Error).message)}`);
    return reply(503, "error:store");
  }

  const rec: Partial<StartRecord> = { at: new Date().toISOString(), biz, trade };
  const bad: string[] = [];
  const legalName = f("legalName");
  if (legalName.length < 2 || legalName.length > 120) bad.push("legalName");
  else rec.legalName = legalName;
  const ownerCell = e164(f("ownerCell"));
  if (!ownerCell) bad.push("ownerCell");
  else rec.ownerCell = ownerCell;
  const carrier = f("carrier") as StartRecord["carrier"];
  if (!CARRIERS.includes(carrier)) bad.push("carrier");
  else rec.carrier = carrier;
  const businessPhone = e164(f("businessPhone"));
  if (!businessPhone) bad.push("businessPhone");
  else rec.businessPhone = businessPhone;
  const site = website(f("website"));
  if (site === null) bad.push("website");
  else rec.website = site;
  /* Only the yes/no is read; any other field a client posts (an "ein") is
     never looked at, stored or sent. */
  const hasEin = f("hasEin");
  if (hasEin !== "yes" && hasEin !== "no") bad.push("hasEin");
  else rec.hasEin = hasEin;
  if (bad.length) return reply(400, `error:${bad.join(",")}`, bad);

  const record = rec as StartRecord;
  try {
    await redis(["LPUSH", KEY.starts, JSON.stringify(record)]);
    await redis(["LTRIM", KEY.starts, 0, 499]);
  } catch (err) {
    console.error(`salvage-start: store failed: ${String((err as Error).message)}`);
    return reply(503, "error:store");
  }

  /* Andy hears about it on the demo line. */
  try {
    const demo = await clientFor(DEMO_LINE);
    if (demo) {
      const carrierName = LIVE_COPY.start.carriers[CARRIERS.indexOf(record.carrier)];
      await sendSms(
        demo.twilioNumber,
        demo.ownerCell,
        fillTemplate(LIVE_COPY.start.alert, {
          legalName: record.legalName,
          biz: record.biz || record.legalName,
          ownerCell: record.ownerCell,
          carrier: carrierName,
          businessPhone: record.businessPhone,
          website: record.website || "-",
          ein: record.hasEin,
        }),
      );
    }
  } catch (err) {
    console.error(`salvage-start: alert failed: ${String((err as Error).message)}`);
  }
  return reply(200, "ok");
}
