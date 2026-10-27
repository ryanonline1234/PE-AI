import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";

// Admin only: give an existing class (made before accounts, so it has no
// owner) to a teacher who has signed in at least once. This replaces the
// retired teacher keys as the way old classes find their teacher.
export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();
  if (account.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.toUpperCase().trim() : "";
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  if (!/^[A-Z0-9]{6}$/.test(code) || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a class code and an email." }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: target } = await supabase.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "That person hasn't signed in to PE.AI yet. Ask them to sign in once first." }, { status: 404 });
  }
  if (target.role !== "teacher" && target.role !== "admin") {
    return NextResponse.json({ error: "Classes can only be given to teacher accounts." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pe_classes")
    .update({ owner_id: target.id, updated_at: new Date().toISOString() })
    .eq("code", code)
    .is("owner_id", null)     // never take a class someone already owns,
    .eq("kind", "class")      // and never a student's personal class
    .select("code");
  if (error) return NextResponse.json({ error: "Couldn't assign the class." }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "No unassigned class with that code." }, { status: 404 });
  }
  return withCookies(NextResponse.json({ ok: true }));
}
