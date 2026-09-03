import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { META, SITE } from "@/lib/client.config";
import "./globals.css";

/* change 22: this Next build emits NO font preload links of its own (the
   change-17 finding), so the layout reads next/font's OWN manifest — never
   a hardcoded hash — and preloads every face the page entry declares
   (Newsreader normal+italic, Plex Sans, Plex Mono). The manifest ships in
   .next/server, so it is traced into the deployed function. */
let fontFiles: string[] | null = null;
function fontPreloads(): string[] {
  if (fontFiles) return fontFiles;
  try {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), ".next", "server", "next-font-manifest.json"), "utf8"),
    ) as { app?: Record<string, string[]> };
    const files = new Set<string>();
    for (const [entry, list] of Object.entries(manifest.app ?? {})) {
      if (!entry.endsWith("/app/page")) continue;
      for (const f of list) if (f.endsWith(".woff2")) files.add(`/_next/${f}`);
    }
    fontFiles = [...files];
  } catch {
    fontFiles = [];
  }
  return fontFiles;
}

/* change 18 — FONTS (Andy's veto block, KEEP_BRAND_FONTS = false), put on
   a byte diet by change 23: the variable Newsreader files (147KB + 132KB)
   were the LCP clog. The display face carries ONLY 500 normal; the caption
   face ONLY 400 italic (its own family — next/font cannot mix per-style
   weights in one loader); Plex Sans 400/500; Plex Mono 400 only, with the
   figures dropped to 400 ([data-figure] in globals.css). All latin, all
   static instances. preload: true marks ONLY the two above-the-fold faces
   (caption italic + mono — the folio mark and the t=0 caption are the only
   web-font text in section 1) in the font manifest the layout reads. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: "500",
  style: "normal",
  display: "swap",
  preload: false,
});

const newsreaderItalic = Newsreader({
  variable: "--font-newsreader-italic",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
  preload: true,
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: true,
});

/* change 21 (E): every absolute URL — og:url, og:image — resolves under
   SITE.domain, never the vercel.app host. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.domain),
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.title,
    description: META.description,
    url: "/",
    siteName: "Salvage",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: META.description }],
  },
  twitter: {
    card: "summary_large_image",
    title: META.title,
    description: META.description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${newsreaderItalic.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="bg-abyss text-ink font-body antialiased">
        {/* React hoists preload links rendered anywhere into <head>. */}
        {fontPreloads().map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        {children}
        <Analytics />
      </body>
    </html>
  );
}
