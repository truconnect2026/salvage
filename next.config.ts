import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The Next dev-tools badge is dev-only (verified absent from the live
     production DOM, change 11 step 7) — disabled here so local review
     screenshots stop carrying it and gate 63 asserts the same everywhere. */
  devIndicators: false,
  /* change 17 enabled experimental.inlineCss so @font-face was discovered
     without waiting for the stylesheet fetch. change 24 turns it back OFF:
     the fonts are explicitly preloaded now (gate 147), so the ~40KB of
     inlined CSS was nothing but document depth in front of the LCP
     element. */
};

export default nextConfig;
