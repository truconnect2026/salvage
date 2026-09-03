import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { META } from "@/lib/client.config";
import "./globals.css";

/* change 18 — FONTS (Andy's veto block, KEEP_BRAND_FONTS = false):
   display Newsreader (opsz variable, 400/500 + italic 400), body IBM Plex
   Sans (400/500), figures IBM Plex Mono (400/500) for EVERY number,
   timestamp, date, phone number, and currency outside the phone screen —
   tabular-nums, wired through the [data-figure] contract in globals.css.
   The phone screen keeps the system stack. To restore the brand pack set
   KEEP_BRAND_FONTS = true and swap back Fraunces/Inter here (mono figures
   stay regardless — they are what makes a log a log). */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://salvage-demo.vercel.app"),
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.title,
    description: META.description,
    url: "/",
    siteName: "Salvage",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: META.title }],
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
    <html lang="en" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="bg-abyss text-ink font-body antialiased">{children}</body>
    </html>
  );
}
