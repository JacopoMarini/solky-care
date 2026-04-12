import { createClient } from '@supabase/supabase-js';

// service_role bypassa RLS — usare solo nel backend
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  status: 'pending' | 'active';
  created_at: string;
};

export type Location = {
  id: string;
  name: string;
  created_at: string;
};

export type WorkEntry = {
  id: string;
  user_id: string;
  location_id: string;
  date: string;
  hours: number;
  start_time?: string;
  end_time?: string;
  notes?: string;
  created_at: string;
};

export type Notification = {
  id: string;
  type: 'new_registration' | 'hours_added';
  read: boolean;
  trigger_user_id: string;
  trigger_user_name: string;
  meta?: Record<string, unknown>;
  created_at: string;
};
