import { ogQuery, resolveGoParams } from "@/lib/go-params";

/*
 * change 45: the front door's web manifest, named after the business, so
 * Add to Home Screen puts THEIR name under the icon. A route handler, not
 * app/manifest.ts: that convention lives at the app root only and never
 * sees the query. Same sanitizer as the page (resolveGoParams).
 */
/* The launcher label: whole words, up to 12 characters (Android trims
   past that); one long word is cut. */
function shortName(name: string): string {
  if (name.length <= 12) return name;
  let out = "";
  for (const w of name.split(/\s+/)) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > 12) break;
    out = next;
  }
  return out || name.slice(0, 12);
}

export function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const p = resolveGoParams(sp);
  const q =
    ogQuery(p) +
    (p.demo ? "&demo=1" : "") +
    (p.ref ? `&ref=${encodeURIComponent(p.ref)}` : "") +
    (p.lead ? `&lead=${encodeURIComponent(p.lead)}` : "");
  const icon = (size: number) => ({ src: `/go/icon?${ogQuery(p)}&size=${size}`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" });
  const body = {
    name: p.biz,
    short_name: shortName(p.biz),
    start_url: `/go?${q}`,
    scope: "/go",
    display: "standalone",
    background_color: "#060B14",
    theme_color: "#060B14",
    icons: [icon(192), icon(512)],
  };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
