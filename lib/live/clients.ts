import { KEY, redis } from "@/lib/live/redis";
import { masked } from "@/lib/live/twilio";

/*
 * change 50: a client is config in Upstash — one JSON record per Twilio
 * number (scripts/seed-clients.mjs writes them):
 *   { twilioNumber, biz, trade, ownerCell, goUrl }   numbers in E.164
 */
export type Client = { twilioNumber: string; biz: string; trade: string; ownerCell: string; goUrl: string };

export async function clientFor(twilioNumber: string): Promise<Client | null> {
  const raw = await redis(["GET", KEY.client(twilioNumber)]);
  if (typeof raw !== "string") return null;
  try {
    const c = JSON.parse(raw) as Client;
    return c && c.twilioNumber && c.ownerCell && c.biz && c.goUrl ? c : null;
  } catch {
    return null;
  }
}

/* A call or text to a number no client owns: logged (the store keeps the
   last 200, the function log the line), never answered with a text. */
export async function logUnknown(kind: "voice" | "sms", to: string, from: string): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), kind, to, from: masked(from) });
  console.warn(`salvage-live: unknown client ${line}`);
  try {
    await redis(["LPUSH", KEY.unknown, line]);
    await redis(["LTRIM", KEY.unknown, 0, 199]);
  } catch (err) {
    console.error(`salvage-live: unknown-log write failed: ${String((err as Error).message)}`);
  }
}

export const fillTemplate = (tpl: string, vals: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => vals[k] ?? m);
