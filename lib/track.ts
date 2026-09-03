"use client";

import { track as vaTrack } from "@vercel/analytics";

/**
 * change 21 (D): the one analytics seam. Every event goes through here so
 * (a) no call site can leak PII by accident — payloads are named fields,
 * never free text — and (b) the gates can observe events deterministically
 * through the `__track` hook without stubbing Vercel's module loader.
 */
declare global {
  interface Window {
    __track?: (name: string, data?: Record<string, string | number | boolean>) => void;
  }
}

export function track(name: string, data?: Record<string, string | number | boolean>) {
  try {
    window.__track?.(name, data);
  } catch {}
  try {
    vaTrack(name, data);
  } catch {}
}
