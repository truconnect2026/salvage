import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The Next dev-tools badge is dev-only (verified absent from the live
     production DOM, change 11 step 7) — disabled here so local review
     screenshots stop carrying it and gate 63 asserts the same everywhere. */
  devIndicators: false,
};

export default nextConfig;
