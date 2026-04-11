import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/api';
import { User, Location, MonthlyRow, DetailRow } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  LogOut, Users, BarChart3, Download, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, MapPin, UserCheck, Clock,
} from 'lucide-react';
import { NotificationPanel } from '@/components/NotificationPanel';

const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

type TabType = 'users' | 'monthly' | 'locations';

interface UserForm {
  name: string; email: string; password: string; role: 'admin' | 'user';
}

// Oggetto da confermare prima di eliminare
interface DeleteTarget {
  type: 'user' | 'location';
  id: string;
  label: string;
}

export default function Admin() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<TabType>('monthly');

  // ── UTENTI ──
  const [users, setUsers] = useState<User[]>([]);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserForm>({ name: '', email: '', password: '', role: 'user' });
  const [userLoading, setUserLoading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, 'admin' | 'user'>>({});

  // ── LOCATION ──
  const [locations, setLocations] = useState<Location[]>([]);
  const [newLocName, setNewLocName] = useState('');
  const [locLoading, setLocLoading] = useState(false);

  // ── CONFERMA ELIMINAZIONE (sostituisce confirm()) ──
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── MENSILE ──
  const [currentMonth, setCurrentMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [detail, setDetail] = useState<DetailRow[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // ── Caricamento ──────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    try { setUsers(await api.users.list()); }
    catch { toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile caricare gli utenti' }); }
  }, []);

  const loadLocations = useCallback(async () => {
    try { setLocations(await api.locations.list()); }
    catch { toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile caricare le location' }); }
  }, []);

  const loadMonthly = useCallback(async () => {
    try { setMonthly(await api.entries.adminMonthly(currentMonth.year, currentMonth.month)); }
    catch { setMonthly([]); }
  }, [currentMonth]);

  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === 'locations') loadLocations(); }, [tab, loadLocations]);
  useEffect(() => { if (tab === 'monthly') loadMonthly(); }, [tab, loadMonthly]);

  // ── Gestione utenti ──────────────────────────────────────────────────────

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({ name: '', email: '', password: '', role: 'user' });
    setUserDialogOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({ name: u.name, email: u.email, password: '', role: u.role });
    setUserDialogOpen(true);
  };

  const saveUser = async () => {
    setUserLoading(true);
    try {
      if (editingUser) {
        const data: Partial<UserForm> = { name: userForm.name, email: userForm.email, role: userForm.role };
        if (userForm.password) data.password = userForm.password;
        await api.users.update(editingUser.id, data);
        toast({ title: 'Utente aggiornato' });
      } else {
        if (!userForm.password) { toast({ variant: 'destructive', title: 'Password obbligatoria' }); return; }
        await api.users.create(userForm);
        toast({ title: 'Utente creato' });
      }
      setUserDialogOpen(false);
      loadUsers();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Errore', description: err instanceof Error ? err.message : 'Errore' });
    } finally {
      setUserLoading(false);
    }
  };

  const activateUser = async (u: User) => {
    const role = pendingRoles[u.id] ?? 'user';
    setActivatingId(u.id);
    try {
      await api.users.activate(u.id, role);
      toast({ title: `${u.name} abilitato come ${role === 'admin' ? 'Admin' : 'Utente'}` });
      loadUsers();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Errore', description: err instanceof Error ? err.message : 'Errore' });
    } finally {
      setActivatingId(null);
    }
  };

  // ── Gestione location ────────────────────────────────────────────────────

  const addLocation = async () => {
    if (!newLocName.trim()) return;
    setLocLoading(true);
    try {
      await api.locations.create(newLocName.trim());
      setNewLocName('');
      toast({ title: 'Location aggiunta' });
      loadLocations();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Errore', description: err instanceof Error ? err.message : 'Errore' });
    } finally {
      setLocLoading(false);
    }
  };

  // ── Eliminazione con AlertDialog (no confirm()) ──────────────────────────

  const confirmDelete = (target: DeleteTarget) => setDeleteTarget(target);

  const handleConfirmedDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'location') {
        await api.locations.delete(deleteTarget.id);
        toast({ title: 'Location eliminata' });
        loadLocations();
      } else {
        await api.users.delete(deleteTarget.id);
        toast({ title: 'Utente eliminato' });
        loadUsers();
      }
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Errore', description: err instanceof Error ? err.message : 'Errore' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Mese ─────────────────────────────────────────────────────────────────

  const changeMonth = (delta: number) => {
    setCurrentMonth((m) => {
      const d = new Date(m.year, m.month - 1 + delta);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  const openDetail = async () => {
    try {
      setDetail(await api.entries.adminDetail(currentMonth.year, currentMonth.month));
      setDetailOpen(true);
    } catch {
      toast({ variant: 'destructive', title: 'Errore nel caricare il dettaglio' });
    }
  };

  const exportExcel = async () => {
    setExportLoading(true);
    try {
      await api.entries.adminExport(currentMonth.year, currentMonth.month);
      toast({ title: 'Export scaricato' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Errore export', description: err instanceof Error ? err.message : 'Errore' });
    } finally {
      setExportLoading(false);
    }
  };

  const byUser = monthly.reduce<Record<string, { rows: MonthlyRow[]; total: number }>>((acc, r) => {
    if (!acc[r.userName]) acc[r.userName] = { rows: [], total: 0 };
    acc[r.userName].rows.push(r);
    acc[r.userName].total += r.totalHours;
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30">

      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Solky Care — Admin</h1>
            <p className="text-xs text-muted-foreground">{user?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={tab === 'monthly' ? 'default' : 'outline'} size="sm" onClick={() => setTab('monthly')}>
              <BarChart3 className="mr-1 h-4 w-4" /> Mensile
            </Button>
            <Button variant={tab === 'users' ? 'default' : 'outline'} size="sm" onClick={() => setTab('users')}>
              <Users className="mr-1 h-4 w-4" /> Utenti
            </Button>
            <Button variant={tab === 'locations' ? 'default' : 'outline'} size="sm" onClick={() => setTab('locations')}>
              <MapPin className="mr-1 h-4 w-4" /> Location
            </Button>
            <NotificationPanel />
            <Button variant="ghost" size="icon" onClick={logout} title="Esci">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">

        {/* ── TAB MENSILE ── */}
        {tab === 'monthly' && (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-lg font-semibold min-w-[180px] text-center">
                    {MONTHS_IT[currentMonth.month - 1]} {currentMonth.year}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={openDetail}>
                    Dettaglio giornaliero
                  </Button>
                  <Button size="sm" onClick={exportExcel} disabled={exportLoading}>
                    <Download className="mr-1 h-4 w-4" />
                    {exportLoading ? 'Esportando…' : 'Scarica Excel'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {Object.keys(byUser).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Nessun dato per questo mese
                </CardContent>
              </Card>
            ) : (
              Object.entries(byUser).map(([userName, { rows, total }]) => (
                <Card key={userName}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{userName}</span>
                      <Badge>{total}h totali</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Ore totali</TableHead>
                          <TableHead className="text-right">Giorni lavorati</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.locationName}>
                            <TableCell className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {r.locationName}
                            </TableCell>
                            <TableCell className="text-right font-medium">{r.totalHours}h</TableCell>
                            <TableCell className="text-right">{r.daysWorked}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── TAB UTENTI ── */}
        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Gestione Utenti</h2>
              <Button size="sm" onClick={openCreateUser}>
                <Plus className="mr-1 h-4 w-4" /> Nuovo utente
              </Button>
            </div>

            {/* Utenti in attesa di approvazione */}
            {users.filter((u) => u.status === 'pending').length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-700">
                    <Clock className="h-4 w-4" />
                    In attesa di approvazione
                    <Badge variant="outline" className="ml-1 border-amber-400 text-amber-700">
                      {users.filter((u) => u.status === 'pending').length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {users.filter((u) => u.status === 'pending').map((u) => (
                    <div key={u.id} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <Select
                        value={pendingRoles[u.id] ?? 'user'}
                        onValueChange={(v) => setPendingRoles((r) => ({ ...r, [u.id]: v as 'admin' | 'user' }))}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Utente</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 gap-1 shrink-0"
                        onClick={() => activateUser(u)}
                        disabled={activatingId === u.id}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {activatingId === u.id ? 'Abilitando…' : 'Abilita'}
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => confirmDelete({ type: 'user', id: u.id, label: u.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Utenti attivi */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter((u) => u.status !== 'pending').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        Nessun utente attivo
                      </TableCell>
                    </TableRow>
                  )}
                  {users.filter((u) => u.status !== 'pending').map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? 'Admin' : 'Utente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditUser(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {u.id !== user?.id && (
                            <Button
                              variant="ghost" size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => confirmDelete({ type: 'user', id: u.id, label: u.name })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}

        {/* ── TAB LOCATION ── */}
        {tab === 'locations' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Gestione Location</h2>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aggiungi nuova location</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Es. Villa Bianca"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                  />
                  <Button onClick={addLocation} disabled={locLoading || !newLocName.trim()}>
                    <Plus className="mr-1 h-4 w-4" /> Aggiungi
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                        Nessuna location presente
                      </TableCell>
                    </TableRow>
                  )}
                  {locations.map((loc) => (
                    <TableRow key={loc._id}>
                      <TableCell className="flex items-center gap-2 font-medium">
                        <MapPin className="h-4 w-4 text-primary" />
                        {loc.name}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => confirmDelete({ type: 'location', id: loc._id, label: loc.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </main>

      {/* ── ALERT DIALOG CONFERMA ELIMINAZIONE ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'location'
                ? <>Vuoi eliminare la location <strong>"{deleteTarget.label}"</strong>? Le ore già registrate su questa location rimarranno nel database.</>
                : <>Vuoi eliminare l'utente <strong>{deleteTarget?.label}</strong>? Tutti i suoi dati e le ore registrate verranno eliminati.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmedDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminazione…' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DIALOG DETTAGLIO ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Dettaglio — {MONTHS_IT[currentMonth.month - 1]} {currentMonth.year}
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dipendente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Ore</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.userName}</TableCell>
                  <TableCell>{r.date.split('-').reverse().join('/')}</TableCell>
                  <TableCell>{r.locationName}</TableCell>
                  <TableCell className="text-right">{r.hours}h</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG UTENTE ── */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Modifica utente' : 'Nuovo utente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{editingUser ? 'Nuova password (lascia vuoto per non cambiare)' : 'Password'}</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Ruolo</Label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm((f) => ({ ...f, role: v as 'admin' | 'user' }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Utente</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Annulla</Button>
            <Button onClick={saveUser} disabled={userLoading}>
              {userLoading ? 'Salvataggio…' : editingUser ? 'Aggiorna' : 'Crea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
