import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { resolveGoParams } from "@/lib/go-params";

/*
 * change 45: the home-screen icon — the business's initials in the page's
 * display face on abyss, over one accent rule. Drawn, not a logo we do not
 * have. Same sanitizer as the page.
 */
const FONT = join(process.cwd(), "app", "go", "og", "Newsreader-Medium.ttf");
let font: Promise<Buffer> | null = null;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const p = resolveGoParams(sp);
  const raw = Number(new URL(req.url).searchParams.get("size"));
  const size = [180, 192, 512].includes(raw) ? raw : 192;
  const serif = await (font ??= readFile(FONT).catch((err) => {
    font = null;
    throw err;
  }));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#060B14" }}>
        <div style={{ display: "flex", fontFamily: "Newsreader", fontSize: Math.round(size * 0.42), color: "#E9EEF4", letterSpacing: "-0.01em", lineHeight: 1 }}>
          {initials(p.biz) || initials(p.preset.bizName)}
        </div>
        <div style={{ display: "flex", width: Math.round(size * 0.34), height: Math.max(2, Math.round(size * 0.02)), marginTop: Math.round(size * 0.07), background: p.preset.accent }} />
      </div>
    ),
    { width: size, height: size, fonts: [{ name: "Newsreader", data: serif, weight: 500, style: "normal" }] },
  );
}
