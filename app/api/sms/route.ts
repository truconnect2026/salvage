import { LIVE_COPY } from "@/lib/client.config";
import { clientFor, fillTemplate, logUnknown } from "@/lib/live/clients";
import { KEY, redis } from "@/lib/live/redis";
import { e164, forbidden, formParams, masked, sendSms, signedUrl, twimlEmpty, validSignature } from "@/lib/live/twilio";

/*
 * change 50: Twilio's inbound-SMS webhook for a client's number.
 *
 * Keywords (CTIA): a message that IS one of the opt-out words opts the
 * sender out of this number; an opt-in word opts them back in. Twilio's own
 * Advanced Opt-Out stays ON for every client number and sends the standard
 * STOP / START / HELP replies (ONBOARDING.md) — this route records the
 * state, so no text of ours ever goes to an opted-out caller, and adds no
 * second reply.
 *
 * Everything else from a caller is forwarded to the owner's cell, prefixed
 * with the caller's number. A text FROM the owner's cell routes back: to the
 * number it starts with, else to the last caller.
 */
const OPT_OUT = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const OPT_IN = new Set(["START", "UNSTOP", "YES"]);
const HELP = new Set(["HELP", "INFO"]);
const LAST_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validSignature(signedUrl(request), params, request.headers.get("x-twilio-signature"))) return forbidden();

  const to = e164(params.To);
  const from = e164(params.From);
  const text = String(params.Body ?? "").trim();
  if (!to || !from) return twimlEmpty();

  try {
    const client = await clientFor(to);
    if (!client) {
      await logUnknown("sms", to, from);
      return twimlEmpty();
    }

    /* The owner answering a caller. */
    if (from === client.ownerCell) {
      const m = text.match(/^\s*(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\s*[:\-–]?\s*([\s\S]*)$/);
      const addressed = m ? e164(m[1]) : null;
      const target = addressed ?? ((await redis(["GET", KEY.last(to)])) as string | null);
      const body = addressed ? m![2].trim() : text;
      if (!target || !body) return twimlEmpty();
      if ((await redis(["SISMEMBER", KEY.optout(to), target])) === 1) return twimlEmpty();
      await sendSms(to, target, body);
      return twimlEmpty();
    }

    const word = text.toUpperCase().replace(/[^A-Z]/g, "");
    if (OPT_OUT.has(word)) {
      await redis(["SADD", KEY.optout(to), from]);
      return twimlEmpty();
    }
    /* An opt-in word re-subscribes someone who had opted out; from anyone
       else ("Yes" to the missed-call text) it is a reply like any other. */
    if (OPT_IN.has(word) && (await redis(["SREM", KEY.optout(to), from])) === 1) return twimlEmpty();
    if (HELP.has(word)) return twimlEmpty();

    /* A caller's reply: to the owner, prefixed with the caller's number. */
    if (text) {
      const sent = await sendSms(to, client.ownerCell, fillTemplate(LIVE_COPY.live.forward, { from, body: text }));
      if (sent) await redis(["SET", KEY.last(to), from, "EX", LAST_SECONDS]);
    }
  } catch (err) {
    console.error(`salvage-live: sms ${masked(from)} -> ${to} failed: ${String((err as Error).message)}`);
  }
  return twimlEmpty();
}
