import { LIVE_COPY } from "@/lib/client.config";
import { clientFor, fillTemplate, logUnknown } from "@/lib/live/clients";
import { DEDUPE_SECONDS, KEY, redis } from "@/lib/live/redis";
import { e164, forbidden, formParams, masked, sendSms, signedUrl, twimlHangup, validSignature } from "@/lib/live/twilio";

/*
 * change 50: Twilio's voice webhook — the number a client's phone forwards
 * missed calls to. Answer, one second of nothing, hang up; then the caller
 * gets ONE text from that client's number with the link to book or text
 * them. One text per caller per 12 hours; never to a caller who opted out;
 * never for a number no client owns (logged instead).
 */
export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validSignature(signedUrl(request), params, request.headers.get("x-twilio-signature"))) return forbidden();

  const to = e164(params.To);
  const from = e164(params.From);
  if (!to || !from) return twimlHangup();

  try {
    const client = await clientFor(to);
    if (!client) {
      await logUnknown("voice", to, from);
      return twimlHangup();
    }
    if (from === client.ownerCell) return twimlHangup();
    const optedOut = (await redis(["SISMEMBER", KEY.optout(to), from])) === 1;
    if (optedOut) return twimlHangup();
    /* The de-dupe is the SET itself: only the first call in 12h sets it. */
    const first = (await redis(["SET", KEY.dedupe(to, from), "1", "NX", "EX", DEDUPE_SECONDS])) === "OK";
    if (first) {
      const body = fillTemplate(LIVE_COPY.live.missedText, { biz: client.biz, go_url: client.goUrl });
      const sent = await sendSms(to, from, body);
      if (sent) await redis(["SET", KEY.last(to), from, "EX", 7 * 24 * 60 * 60]);
      else await redis(["DEL", KEY.dedupe(to, from)]);
    }
  } catch (err) {
    console.error(`salvage-live: voice ${masked(from)} -> ${to} failed: ${String((err as Error).message)}`);
  }
  return twimlHangup();
}
