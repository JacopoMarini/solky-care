// In dev il proxy di Vite gestisce /api → localhost:3001
// In produzione punta all'URL del backend (Railway)
const BASE = import.meta.env.VITE_API_URL ?? '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const hasBody = options.body != null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // 202 Accepted = registrazione pending, non è un errore
  if (!res.ok && res.status !== 202) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Errore ${res.status}`);
  }

  // Per le risposte blob (Excel)
  const contentType = res.headers.get('Content-Type') ?? '';
  if (contentType.includes('spreadsheetml')) {
    return res.blob() as unknown as T;
  }

  return res.json() as Promise<T>;
}

// Auth
export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: import('./types').User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (name: string, email: string, password: string) =>
      request<{ token: string; user: import('./types').User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }),
    me: () => request<import('./types').User>('/auth/me'),
  },

  users: {
    list: () => request<import('./types').User[]>('/users'),
    create: (data: { name: string; email: string; password: string; role?: string }) =>
      request<import('./types').User>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; email: string; role: string; password: string }>) =>
      request<{ success: boolean }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
    activate: (id: string, role: 'admin' | 'user') =>
      request<{ success: boolean; user: import('./types').User }>(`/users/${id}/activate`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
  },

  locations: {
    list: () => request<import('./types').Location[]>('/locations'),
    create: (name: string) =>
      request<import('./types').Location>('/locations', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/locations/${id}`, { method: 'DELETE' }),
  },

  entries: {
    forDate: (date: string) =>
      request<import('./types').WorkEntry[]>(`/entries/my?date=${date}`),
    myMonth: (year: number, month: number) =>
      request<import('./types').WorkEntry[]>(`/entries/my/month?year=${year}&month=${month}`),
    upsert: (data: { locationId: string; date: string; hours: number; startTime?: string; endTime?: string; notes?: string }) =>
      request<{ id?: string; deleted?: boolean; upserted?: boolean }>('/entries', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' }),

    // Admin
    adminMonthly: (year: number, month: number) =>
      request<import('./types').MonthlyRow[]>(`/entries/admin/monthly?year=${year}&month=${month}`),
    adminDetail: (year: number, month: number) =>
      request<import('./types').DetailRow[]>(`/entries/admin/detail?year=${year}&month=${month}`),
    adminExport: async (year: number, month: number) => {
      const blob = await request<Blob>(`/entries/admin/export?year=${year}&month=${month}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ore_${year}_${String(month).padStart(2, '0')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },

  notifications: {
    list: (unreadOnly = false) =>
      request<{ items: import('./types').Notification[]; unreadCount: number }>(
        `/notifications${unreadOnly ? '?unreadOnly=true' : ''}`
      ),
    unreadCount: () =>
      request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) =>
      request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () =>
      request<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),
    activate: (userId: string, opts: { role?: 'admin' | 'user'; notificationId?: string }) =>
      request<{ success: boolean; user: import('./types').User }>(`/notifications/activate/${userId}`, {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
  },
};
