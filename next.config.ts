import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The Next dev-tools badge is dev-only (verified absent from the live
     production DOM, change 11 step 7) — disabled here so local review
     screenshots stop carrying it and gate 63 asserts the same everywhere. */
  devIndicators: false,
  /* change 17 enabled experimental.inlineCss; change 24 disabled it on the
     premise that the inlined CSS was pure document depth — measurement
     falsified that (it was render-UNBLOCKING: the score gate regressed
     77 -> 72 while observed LCP didn't move). change 25 restores it and
     keeps change 24's other lever (presets as data). */
  experimental: {
    inlineCss: true,
  },
};

export default nextConfig;
