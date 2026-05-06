export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'active';
}

export interface Notification {
  id: string;
  type: 'new_registration' | 'hours_added';
  read: boolean;
  trigger_user_id: string;
  trigger_user_name: string;
  meta?: Record<string, unknown>;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
}

export interface WorkEntry {
  id: string;
  date: string;
  hours: number;
  start_time?: string;
  end_time?: string;
  notes?: string;
  locationId: string;
  locationName: string;
}

export interface MonthlyRow {
  userId: string;
  userName: string;
  userEmail: string;
  locationName: string;
  totalHours: number;
  daysWorked: number;
}

export interface DetailRow {
  userName: string;
  userEmail: string;
  date: string;
  locationName: string;
  hours: number;
  notes: string;
}
