import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The Next dev-tools badge is dev-only (verified absent from the live
     production DOM, change 11 step 7) — disabled here so local review
     screenshots stop carrying it and gate 63 asserts the same everywhere. */
  devIndicators: false,
  /* change 17 (F1, config-only LCP work): this Next build emits NO font
     preload links, so the @font-face rules — and with them the font
     downloads that gate the E1 fonts-ready reveal — were only discovered
     after the render-blocking CSS fetch. Inlining the CSS puts the
     @font-face in the HTML itself: fonts start downloading a full
     round-trip earlier on the slow-4G LCP path. */
  experimental: {
    inlineCss: true,
  },
};

export default nextConfig;
