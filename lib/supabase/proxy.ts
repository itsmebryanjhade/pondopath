import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { publicSupabaseConfig } from "./config";
import { consumeLoginNotice, prepareLoginNotice } from "@/lib/auth-notice";

export async function updateSession(request: NextRequest) {
  prepareLoginNotice(request);
  let response = NextResponse.next({ request });
  const hasAuthCookies = request.cookies.getAll().some(c => c.name.startsWith("sb-"));
  if (hasAuthCookies) {
    const { url, key } = publicSupabaseConfig();
    const client = createServerClient<Database>(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });
    await client.auth.getClaims();
  }
  consumeLoginNotice(request, response);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
