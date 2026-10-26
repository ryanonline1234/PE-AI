import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Fixed-window rate limiting backed by the rate_limit_check() Postgres function
// (supabase/migrations/20261026000003_rate_limits.sql). One RPC checks every
// bucket for the request. Fails OPEN: if the limiter itself errors we log and
// allow the request, because blocking a whole class over a limiter outage is
// the worse failure for a gym-floor tool.

export interface Bucket {
  name: string;
  windowSeconds: number;
  limit: number;
}

export const WINDOW = { tenMinutes: 600, hour: 3600, day: 86400 } as const;

/** Best-effort client IP. Whole schools share one NAT IP, so per-IP limits stay generous. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Returns the name of the first bucket over its limit, or null if allowed. */
export async function checkRateLimit(
  supabase: SupabaseClient,
  buckets: Bucket[]
): Promise<string | null> {
  const { data, error } = await supabase.rpc("rate_limit_check", {
    p_buckets: buckets.map((b) => b.name),
    p_windows: buckets.map((b) => b.windowSeconds),
    p_limits:  buckets.map((b) => b.limit),
  });
  if (error) {
    console.error("rate_limit_check error (failing open):", error);
    return null;
  }
  return (data as string | null) ?? null;
}

export function rateLimitedResponse(bucket: string): NextResponse {
  console.warn("rate limited:", bucket);
  return NextResponse.json(
    { error: "Too many requests right now. Wait a minute and try again." },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}
