import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";
import { publicSupabaseConfig } from "./config";

export const createClient = cache(async () => {
  // Auth also reads the clock in background callbacks; keep initialization request-bound.
  await connection();
  const store = await cookies();
  const { url, key } = publicSupabaseConfig();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; the proxy refreshes them first.
        }
      },
    },
  });
});
