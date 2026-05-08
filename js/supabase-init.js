import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabase = null;
try {
  const mod = await import("./supabase-config.js");
  if (mod.SUPABASE_URL && mod.SUPABASE_ANON_KEY && !mod.SUPABASE_URL.includes("SEU-PROJETO")) {
    supabase = createClient(mod.SUPABASE_URL, mod.SUPABASE_ANON_KEY);
  }
} catch {
  // supabase-config.js ausente
}

export { supabase };
