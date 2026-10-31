import { createClient } from '@supabase/supabase-js';

// Central Supabase configuration for SISTEMALOG
export const SUPABASE_URL = 'https://dwyofmibngjlqcvzahee.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3eW9mbWlibmdqbHFjdnphaGVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NzIxNzksImV4cCI6MjEwOTA0ODE3OX0.PMgxQUt3X75XcyaXnLo53nzM_a62gXX70CWRpoYmxmQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  realtime: {
    params: {
      eventsPerSecond: 20
    }
  }
});
