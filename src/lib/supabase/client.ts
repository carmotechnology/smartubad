"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Browser client. Carries the user's session, so every query it makes is
 * subject to RLS. Used only for auth actions (OAuth redirect, magic link,
 * sign-out) and realtime — data fetching happens on the server.
 */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseKey);
}
