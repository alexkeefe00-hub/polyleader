import { createClient } from "@supabase/supabase-js";
export function serverDb(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL;const k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)throw new Error("Supabase environment variables are missing");return createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}});}
