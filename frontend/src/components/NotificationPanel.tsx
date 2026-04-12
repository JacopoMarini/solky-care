import { useState, useEffect, useCallback } from 'react';
import { api } from '@/api';
import { Notification } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Bell, UserCheck, Clock, CheckCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'adesso';
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [roleChoice, setRoleChoice] = useState<Record<string, 'admin' | 'user'>>({});

  const loadNotifications = useCallback(async () => {
    try {
      const { items, unreadCount } = await api.notifications.list();
      setNotifications(items);
      setUnreadCount(unreadCount);
    } catch { /* silenzioso */ }
  }, []);

  // Polling leggero: ogni 30s controlla solo il contatore
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(async () => {
      try {
        const { count } = await api.notifications.unreadCount();
        setUnreadCount(count);
      } catch { /* silenzioso */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Quando si apre il pannello, carica e aggiorna il count
  const handleOpen = () => {
    setOpen(true);
    loadNotifications();
  };

  const markAllRead = async () => {
    await api.notifications.markAllRead();
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  const markRead = async (id: string) => {
    await api.notifications.markRead(id);
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const activateUser = async (n: Notification) => {
    const role = roleChoice[n.id] ?? 'user';
    setActivatingId(n.id);
    try {
      await api.notifications.activate(n.trigger_user_id, { role, notificationId: n.id });
      toast({ title: `${n.trigger_user_name} abilitato come ${role === 'admin' ? 'Admin' : 'Utente'}` });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Errore', description: err instanceof Error ? err.message : 'Errore' });
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <>
      {/* Campana con badge */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-md hover:bg-accent transition-colors"
        title="Notifiche"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Pannello notifiche */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-full max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifiche
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">{unreadCount}</Badge>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Segna tutte come lette
                </button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {notifications.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">Nessuna notifica</p>
            )}

            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'rounded-lg border p-3 space-y-2 transition-colors',
                  !n.read ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'
                )}
              >
                <div className="flex items-start gap-2">
                  {/* Icona tipo */}
                  <div className={cn(
                    'flex-shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full',
                    n.type === 'new_registration' ? 'bg-amber-100' : 'bg-blue-100'
                  )}>
                    {n.type === 'new_registration'
                      ? <User className="h-3.5 w-3.5 text-amber-600" />
                      : <Clock className="h-3.5 w-3.5 text-blue-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">
                      {n.type === 'new_registration' ? (
                        <><strong>{n.trigger_user_name}</strong> ha richiesto l'accesso</>
                      ) : (
                        <><strong>{n.trigger_user_name}</strong> ha inserito le ore</>
                      )}
                    </p>

                    {n.meta && n.type === 'hours_added' && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {String(n.meta.date)} · {String(n.meta.locationName)} · {String(n.meta.hours)}h
                      </p>
                    )}
                    {n.meta && n.type === 'new_registration' && (
                      <p className="text-xs text-muted-foreground mt-0.5">{String(n.meta.email)}</p>
                    )}

                    <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                  </div>

                  {!n.read && n.type !== 'new_registration' && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="flex-shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                      title="Segna come letta"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Azione abilita utente */}
                {n.type === 'new_registration' && !n.read && (
                  <div className="flex items-center gap-2 pt-1">
                    <Select
                      value={roleChoice[n.id] ?? 'user'}
                      onValueChange={(v) => setRoleChoice((r) => ({ ...r, [n.id]: v as 'admin' | 'user' }))}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Utente</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => activateUser(n)}
                      disabled={activatingId === n.id}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      {activatingId === n.id ? 'Abilitando…' : 'Abilita'}
                    </Button>
                  </div>
                )}

                {/* Badge già abilitato */}
                {n.type === 'new_registration' && n.read && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> Utente abilitato
                  </p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
