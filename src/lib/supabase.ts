import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fail with the actual reason. Without these two variables the client used to
// throw "supabaseUrl is required" from deep inside, and every login/page just
// answered 500 with no hint that the fix is a missing .env.local.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY: copia .env.local.example a .env.local y rellénalos.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
