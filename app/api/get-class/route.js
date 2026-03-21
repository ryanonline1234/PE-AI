import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";

export async function GET(request) {
  // 1. Verify the request comes from our own frontend
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Extract class code from query params
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.toUpperCase();

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  // 3. Look up in Supabase
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pe_classes")
    .select("config, created_at, updated_at")
    .eq("code", code)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  return NextResponse.json({ config: data.config });
}
