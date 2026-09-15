import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseUrl = (rawUrl || 'https://kesmxodaxvqfvlskhuhf.supabase.co').trim();
export const supabaseAnonKey = (rawAnonKey || '').trim();

// Evaluates whether real client credentials are set
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'your_supabase_anon_key_here'
);

// Fallback key to avoid throwing "supabaseKey is required" on module initialization
const activeKey = isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key-configure-frontend-env';

export const supabase: SupabaseClient = createClient(supabaseUrl, activeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
