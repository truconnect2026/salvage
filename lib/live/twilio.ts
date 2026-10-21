import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * change 50: the Twilio seam — webhook signatures, outbound SMS, TwiML.
 * No SDK: the signature is Twilio's documented scheme (HMAC-SHA1 of the
 * full webhook URL followed by every POST parameter, sorted by name, each
 * name immediately followed by its value; base64), and a text is one REST
 * call. Credentials come from the environment only (TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN — Vercel env) and are never logged.
 *
 * TWILIO_API_BASE exists for the gates' mock Twilio; production leaves it
 * unset and talks to api.twilio.com.
 */

export function signatureFor(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function validSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const want = Buffer.from(signatureFor(url, params, token));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/* The URL Twilio signed: the public origin when one is configured (a proxy
   in front would otherwise change it), else the request's own. */
export function signedUrl(request: Request): string {
  const u = new URL(request.url);
  const base = process.env.SALVAGE_PUBLIC_ORIGIN;
  return base ? `${base.replace(/\/$/, "")}${u.pathname}${u.search}` : u.toString();
}

/* A webhook's form body as a plain record (Twilio posts urlencoded). */
export async function formParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const form = await request.formData();
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

/* +1XXXXXXXXXX for any US 10- or 11-digit number; null otherwise. */
export function e164(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/* A caller's number for a log line: the last four only. */
export const masked = (n: string) => `***${n.slice(-4)}`;

export async function sendSms(from: string, to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.error("salvage-live: Twilio not configured; text not sent");
    return false;
  }
  const base = (process.env.TWILIO_API_BASE ?? "https://api.twilio.com").replace(/\/$/, "");
  const res = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    /* Twilio's error code says why (21610: the recipient opted out). */
    let code = "";
    try {
      code = String(((await res.json()) as { code?: number }).code ?? "");
    } catch {}
    console.error(`salvage-live: text to ${masked(to)} failed ${res.status} ${code}`);
    return false;
  }
  return true;
}

const XML = { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" };
/* The voice answer: one second of nothing, then hang up. */
export const twimlHangup = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Hangup/></Response>', { headers: XML });
/* An inbound text needs no TwiML reply; every send is a REST call. */
export const twimlEmpty = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { headers: XML });
export const forbidden = () => new Response("forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
