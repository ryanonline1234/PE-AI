import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// Daily keep-alive, scheduled in vercel.json. Supabase pauses free-tier
// projects after a stretch of inactivity (school breaks), and the first class
// back would then hit "Class not found". One cheap read a day keeps it awake.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("pe_classes")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("keepalive query failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, classes: count ?? 0, at: new Date().toISOString() });
}
