"use client";


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

/* change 48: the analytics script loads after idle (IdleAnalytics). Until it
   does, events wait in the queue the official snippet itself creates — the
   script drains window.vaq when it lands — instead of being dropped. */
function ensureQueue() {
  if (typeof window === "undefined" || window.va) return;
  window.va = (event, properties) => {
    (window.vaq ??= []).push([event, properties]);
  };
}

export function track(name: string, data?: Record<string, string | number | boolean>) {
  try {
    window.__track?.(name, data);
  } catch {}
  ensureQueue();
  /* What @vercel/analytics' track() does for a flat payload — without
     importing it into the first load (change 48). */
  try {
    window.va?.("event", data ? { name, data } : { name });
  } catch {}
}
