import { createServerClient as createSSRClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Session refresh for Server Components (they can't write cookies). Pattern
// from Supabase's Next.js SSR guide: no code between createServerClient and
// getClaims(), or users get randomly signed out.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );
  await supabase.auth.getClaims();
  return response;
}
