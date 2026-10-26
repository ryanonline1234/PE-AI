"use client";

import { useEffect } from "react";

// Registers public/sw.js in production builds only (dev + HMR don't mix with
// a caching worker). Failure is silent: the app works without it.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
