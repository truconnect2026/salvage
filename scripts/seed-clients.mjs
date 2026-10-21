// change 50: write Salvage Live clients into Upstash — the store the
// webhooks read (lib/live/clients.ts). Credentials come from the
// environment only (UPSTASH_REDIS_REST_URL / _TOKEN, e.g. from
// `vercel env pull`); nothing secret is ever printed.
//
//   node scripts/seed-clients.mjs                 seed client #0, the DEMO line
//   node scripts/seed-clients.mjs add --twilio +18045550100 --biz "Robinson's Heating & Air" \
//        --trade hvac --owner +18045550199 --go "https://salvage.davyjoneslocker.app/go?biz=..."
//   node scripts/seed-clients.mjs show +18045550100
//
// Numbers in E.164. A client record: { twilioNumber, biz, trade, ownerCell, goUrl }.

const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
if (!url || !token) {
  console.error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set (values are never printed).");
  process.exit(1);
}

async function redis(cmd) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd.map(String)) });
  if (!res.ok) throw new Error(`redis ${cmd[0]} -> ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`redis ${cmd[0]} -> ${body.error}`);
  return body.result;
}

const e164 = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  throw new Error(`not a US number: ${raw}`);
};

/* Client #0: Andy's demo line. The text it sends is the product's own, and
   the door it links is caller-agnostic — the demo's "Your business". */
const DEMO = {
  twilioNumber: "+18044953492",
  biz: "Your business",
  trade: "",
  ownerCell: "+17578073318",
  goUrl: "https://salvage.davyjoneslocker.app/go?preset=other&demo=1",
};

const [cmd = "seed", ...rest] = process.argv.slice(2);
const arg = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (cmd === "seed") {
  await redis(["SET", `salvage:client:${DEMO.twilioNumber}`, JSON.stringify(DEMO)]);
  console.log(`seeded client #0 (demo) at salvage:client:${DEMO.twilioNumber}`);
} else if (cmd === "add") {
  const c = {
    twilioNumber: e164(arg("twilio")),
    biz: String(arg("biz") ?? "").trim(),
    trade: String(arg("trade") ?? "").trim(),
    ownerCell: e164(arg("owner")),
    goUrl: String(arg("go") ?? "").trim(),
  };
  if (!c.biz || !/^https:\/\//.test(c.goUrl)) throw new Error("--biz and an https --go link are required");
  await redis(["SET", `salvage:client:${c.twilioNumber}`, JSON.stringify(c)]);
  console.log(`added ${c.biz} at salvage:client:${c.twilioNumber}`);
} else if (cmd === "show") {
  console.log((await redis(["GET", `salvage:client:${e164(rest[0])}`])) ?? "(none)");
} else {
  console.error("usage: seed | add --twilio --biz --trade --owner --go | show <number>");
  process.exit(1);
}
