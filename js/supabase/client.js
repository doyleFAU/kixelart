import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env.js";

let clientPromise = null;

export function isCloudEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function getSupabase() {
  if (!isCloudEnabled()) return null;
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return clientPromise;
}
