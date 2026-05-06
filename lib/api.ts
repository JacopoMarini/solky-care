const BASE = '/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
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

  if (!res.ok && res.status !== 202) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Errore ${res.status}`);
  }

  const contentType = res.headers.get('Content-Type') ?? '';
  if (contentType.includes('spreadsheetml')) {
    return res.blob() as unknown as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: import('@/types').User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (name: string, email: string, password: string) =>
      request<{ token: string; user: import('@/types').User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }),
    me: () => request<import('@/types').User>('/auth/me'),
  },

  users: {
    list: () => request<import('@/types').User[]>('/users'),
    create: (data: { name: string; email: string; password: string; role?: string }) =>
      request<import('@/types').User>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; email: string; role: string; password: string }>) =>
      request<{ success: boolean }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
    activate: (id: string, role: 'admin' | 'user') =>
      request<{ success: boolean; user: import('@/types').User }>(`/users/${id}/activate`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
  },

  locations: {
    list: () => request<import('@/types').Location[]>('/locations'),
    create: (name: string) =>
      request<import('@/types').Location>('/locations', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/locations/${id}`, { method: 'DELETE' }),
  },

  entries: {
    forDate: (date: string) =>
      request<import('@/types').WorkEntry[]>(`/entries/my?date=${date}`),
    myMonth: (year: number, month: number) =>
      request<import('@/types').WorkEntry[]>(`/entries/my/month?year=${year}&month=${month}`),
    create: (data: { locationId: string; date: string; hours: number; start_time?: string; end_time?: string; notes?: string }) =>
      request<{ id: string }>('/entries', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { hours?: number; start_time?: string; end_time?: string; notes?: string }) =>
      request<{ success: boolean }>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
    adminMonthly: (year: number, month: number) =>
      request<import('@/types').MonthlyRow[]>(`/entries/admin/monthly?year=${year}&month=${month}`),
    adminDetail: (year: number, month: number) =>
      request<import('@/types').DetailRow[]>(`/entries/admin/detail?year=${year}&month=${month}`),
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
      request<{ items: import('@/types').Notification[]; unreadCount: number }>(
        `/notifications${unreadOnly ? '?unreadOnly=true' : ''}`
      ),
    unreadCount: () =>
      request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) =>
      request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () =>
      request<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),
    activate: (userId: string, opts: { role?: 'admin' | 'user'; notificationId?: string }) =>
      request<{ success: boolean; user: import('@/types').User }>(`/notifications/activate/${userId}`, {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
  },
};
