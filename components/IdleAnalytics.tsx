"use client";

import { useEffect, useState, type ComponentType } from "react";

/* change 48: Vercel Web Analytics loads AFTER the page is idle — its client
   code and its script never compete with the first paint. A plain dynamic
   import (no next/dynamic: its loader runtime weighs as much as the
   analytics client itself). Events fired before then wait in the same queue
   the official snippet creates (lib/track.ts); the script drains it when it
   lands. */
export default function IdleAnalytics() {
  const [Analytics, setAnalytics] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      void import("@vercel/analytics/next").then((m) => {
        if (live) setAnalytics(() => m.Analytics);
      });
    };
    const idle = () => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 4000 });
      else load();
    };
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
    return () => {
      live = false;
      window.removeEventListener("load", idle);
    };
  }, []);
  return Analytics ? <Analytics /> : null;
}
