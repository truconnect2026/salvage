import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { META } from "@/lib/client.config";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="bg-abyss text-ink font-body antialiased">{children}</body>
    </html>
  );
}
