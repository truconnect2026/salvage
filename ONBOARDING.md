# Salvage Live — onboarding (one page)

## Once (Andy)

1. Vercel → `salvage-demo` → Settings → Environment Variables (Production):
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_START_URL` (your $250 Payment Link).
   Never paste them anywhere else.
2. Seed client #0, the demo line: `vercel env pull .env.production.local`, then
   `node --env-file=.env.production.local scripts/seed-clients.mjs`.
3. Twilio → the demo number (+1 804 495 3492): Voice "A call comes in" →
   Webhook, HTTP POST, `https://salvage.davyjoneslocker.app/api/voice`;
   Messaging "A message comes in" → `https://salvage.davyjoneslocker.app/api/sms`.

## Per client

1. Buy a Twilio local number in the shop's area code. Point its Voice and
   Messaging webhooks at the two URLs above (POST).
2. Keep Twilio's **Advanced Opt-Out ON** for the number's Messaging Service:
   it answers STOP / START / HELP. Set the HELP reply to the shop's name and
   phone. Salvage records every STOP and never texts that caller again.
3. Add the client:
   `node --env-file=.env.production.local scripts/seed-clients.mjs add --twilio +1804XXXXXXX --biz "Shop Name" --trade hvac --owner +1804XXXXXXX --go "https://salvage.davyjoneslocker.app/go?biz=Shop%20Name&preset=home&trade=hvac"`
4. The owner turns on forwarding **when busy or unanswered** to the Salvage
   number, from the business phone:

| Carrier | Turn on | Turn off |
|---|---|---|
| Verizon | `*71` + the 10-digit Salvage number, then Call | `*73` |
| AT&T, T-Mobile | `**004*1XXXXXXXXXX#`, then Call | `##004#` |
| Landline / VoIP | the provider's "forward on no answer" setting | same |

## The test call (with the owner on the phone)

1. From a phone that is **not** the owner's cell, call the business number
   and let it ring out. Within about 10 seconds that phone gets one text from
   the Salvage number: the shop's name and the /go link.
2. Reply "test". The owner's cell gets `+1…: test`. The owner replies; the
   test phone gets it. (To text someone else, the owner starts the reply with
   their number: `8045551234: …`.)
3. Call again: no second text (one per caller per 12 hours).
4. Text STOP: Twilio confirms; call again: no text. Text START to undo.
5. Calls from the owner's own cell never get a text. The owner must never
   text STOP to the Salvage number.

## Carrier registration (A2P 10DLC) — every client, before go-live

Texts from an unregistered number get filtered. In Twilio → Trust Hub:

1. **Brand**: the client's legal business name, address, and EIN — or a Sole
   Proprietor brand (no EIN; the owner verifies by a code to their cell).
   /start only asks whether they have an EIN; take the number on the
   registration call and enter it in Twilio only — Salvage never stores it.
2. **Campaign**: use case Customer Care. Description: "When the business
   misses a call, the caller gets one text with a link to book or reply.
   Replies are forwarded to the owner." Opt-in: "The customer calls the
   business; the single text-back goes to the number that called, and replies
   continue the conversation the customer started. Reply STOP to opt out."
3. Sample messages: the missed-call text with the shop's name and link, and
   a reply ("Yes, 10am works.").
4. Privacy and terms (required on every campaign from June 30, 2026):
   `https://salvage.davyjoneslocker.app/privacy` and `/terms` — every /go page
   links both.
5. Attach the number to the campaign's Messaging Service. Approval takes days;
   go-live is the day it clears (usually 3–7 days, as the agreement says).
