import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { META } from "@/lib/client.config";
import "./globals.css";

/* Change 10: Fraunces replaces Cormorant Garamond as the display face.
   Variable, with the optical-size and SOFT axes loaded — the warmth comes
   from font-variation-settings in globals.css, not a separate weight file. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="bg-abyss text-ink font-body antialiased">{children}</body>
    </html>
  );
}
