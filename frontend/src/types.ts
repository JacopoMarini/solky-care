export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'active';
}

export interface Notification {
  _id: string;
  type: 'new_registration' | 'hours_added';
  read: boolean;
  triggerUserId: string;
  triggerUserName: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface Location {
  _id: string;
  name: string;
}

export interface WorkEntry {
  id: string;
  date: string;
  hours: number;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
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
