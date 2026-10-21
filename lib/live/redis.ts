/*
 * change 50: Upstash Redis over its REST API — the Kickin' Chicken pattern:
 * plain fetch, no SDK, the URL and token from the environment (Vercel env
 * only; never printed). The gates run this same code against
 * scripts/upstash-stub.mjs, so the only untested seam is the hostname.
 */

type Reply = { result?: unknown; error?: string };

function env(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function storeConfigured(): boolean {
  return env() !== null;
}

export async function redis(cmd: (string | number)[]): Promise<unknown> {
  const cfg = env();
  if (!cfg) throw new Error("store not configured");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${cmd[0]} -> ${res.status}`);
  const body = (await res.json()) as Reply;
  if (body.error !== undefined) throw new Error(`redis ${cmd[0]} -> ${body.error}`);
  return body.result;
}

/* The keys, in one place. A client is addressed by its Twilio number. */
export const KEY = {
  client: (twilio: string) => `salvage:client:${twilio}`,
  /* One text per caller per 12h, per client. */
  dedupe: (twilio: string, caller: string) => `salvage:dedupe:${twilio}:${caller}`,
  /* Callers who texted STOP to this client's number. */
  optout: (twilio: string) => `salvage:optout:${twilio}`,
  /* The caller the owner's next plain reply goes to. */
  last: (twilio: string) => `salvage:last:${twilio}`,
  /* Calls and texts to a number no client owns. */
  unknown: "salvage:log:unknown",
  /* /start submissions. */
  starts: "salvage:starts",
  /* /start rate limit, per client IP and hour. */
  startRate: (ip: string) => `salvage:start-rate:${ip}`,
};

export const DEDUPE_SECONDS = 12 * 60 * 60;
