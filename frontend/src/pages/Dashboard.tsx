import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/api';
import { Location, WorkEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Plus, LogOut, Clock, MapPin, X } from 'lucide-react';
import { SolkyLogo } from '@/components/SolkyLogo';
import { cn } from '@/lib/utils';

// ─── Costanti ───────────────────────────────────────────────────────────────

const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAYS_IT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

// Colori per le location (ciclo sui 6 disponibili)
const LOC_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-700',   ring: 'ring-blue-400',   dot: 'bg-blue-400'   },
  { bg: 'bg-emerald-100',text: 'text-emerald-700', ring: 'ring-emerald-400',dot: 'bg-emerald-400' },
  { bg: 'bg-violet-100', text: 'text-violet-700',  ring: 'ring-violet-400', dot: 'bg-violet-400'  },
  { bg: 'bg-amber-100',  text: 'text-amber-700',   ring: 'ring-amber-400',  dot: 'bg-amber-400'   },
  { bg: 'bg-rose-100',   text: 'text-rose-700',    ring: 'ring-rose-400',   dot: 'bg-rose-400'    },
  { bg: 'bg-cyan-100',   text: 'text-cyan-700',    ring: 'ring-cyan-400',   dot: 'bg-cyan-400'    },
];

// ─── Utility ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff / 60 : 0;
}

function formatHours(h: number): string {
  const totalMinutes = Math.round(h * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}.${String(minutes).padStart(2, '0')}h`;
}

function buildCalendarCells(year: number, month: number): (number | null)[] {
  // Giorno della settimana del primo del mese (0=Dom → remap a Lun=0)
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset = (firstDow + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Tipi locali ─────────────────────────────────────────────────────────────

interface Slot {
  key: string;       // chiave React univoca
  locId: string;
  startTime: string;
  endTime: string;
  hours: number;
  notes: string;
  existingId?: string;
}

// ─── Componente principale ───────────────────────────────────────────────────

export default function Dashboard() {
  const { user, logout } = useAuth();
  const today = toDateStr(new Date());

  const [currentMonth, setCurrentMonth] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  // Tutte le entry del mese corrente, indicizzate per data
  const [monthEntries, setMonthEntries] = useState<WorkEntry[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Modale
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Caricamento dati ──────────────────────────────────────────────────────

  const loadLocations = useCallback(async () => {
    const locs = await api.locations.list();
    setLocations(locs);
    return locs;
  }, []);

  const loadMonth = useCallback(async () => {
    const entries = await api.entries.myMonth(currentMonth.year, currentMonth.month);
    setMonthEntries(entries);
  }, [currentMonth]);

  useEffect(() => { loadLocations(); }, [loadLocations]);
  useEffect(() => { loadMonth(); }, [loadMonth]);

  // ── Costruzione griglia calendario ───────────────────────────────────────

  const cells = useMemo(
    () => buildCalendarCells(currentMonth.year, currentMonth.month),
    [currentMonth]
  );

  const entriesByDate = useMemo(() => {
    const map: Record<string, WorkEntry[]> = {};
    for (const e of monthEntries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [monthEntries]);

  const colorByLocId = useMemo(() => {
    const map: Record<string, (typeof LOC_COLORS)[0]> = {};
    locations.forEach((loc, i) => { map[loc.id] = LOC_COLORS[i % LOC_COLORS.length]; });
    return map;
  }, [locations]);

  // ── Apertura modale ───────────────────────────────────────────────────────

  const openModal = useCallback(async (dateStr: string) => {
    let existing: WorkEntry[] = [];
    try { existing = await api.entries.forDate(dateStr); } catch { /* nessuna entry */ }

    setSlots(existing.map((e) => ({
      key:        e.id,
      locId:      e.locationId,
      startTime:  e.start_time ?? '',
      endTime:    e.end_time ?? '',
      hours:      e.hours,
      notes:      e.notes ?? '',
      existingId: e.id,
    })));
    setDeletedIds([]);
    setModalDate(dateStr);
  }, [locations]);

  // ── Aggiunta / rimozione slot ─────────────────────────────────────────────

  const addSlot = (locId: string) => {
    setSlots((prev) => [...prev, { key: crypto.randomUUID(), locId, startTime: '', endTime: '', hours: 0, notes: '' }]);
  };

  const removeSlot = (key: string) => {
    const slot = slots.find((s) => s.key === key);
    if (slot?.existingId) setDeletedIds((ids) => [...ids, slot.existingId!]);
    setSlots((prev) => prev.filter((s) => s.key !== key));
  };

  // ── Aggiornamento campo slot ──────────────────────────────────────────────

  const updateSlot = (key: string, field: 'startTime' | 'endTime' | 'notes', value: string) => {
    setSlots((prev) => prev.map((s) => {
      if (s.key !== key) return s;
      const updated = { ...s, [field]: value };
      if (field === 'startTime' || field === 'endTime')
        updated.hours = calcHours(updated.startTime, updated.endTime);
      return updated;
    }));
  };

  // ── Salvataggio ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!modalDate) return;
    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];

      // Elimina slot rimossi
      for (const id of deletedIds) ops.push(api.entries.delete(id));

      // Salva ogni slot valido
      for (const slot of slots) {
        if (slot.hours <= 0) {
          if (slot.existingId) ops.push(api.entries.delete(slot.existingId));
          continue;
        }
        const data = {
          locationId: slot.locId, date: modalDate, hours: slot.hours,
          start_time: slot.startTime || undefined,
          end_time:   slot.endTime   || undefined,
          notes:      slot.notes     || undefined,
        };
        if (slot.existingId) {
          ops.push(api.entries.update(slot.existingId, data));
        } else {
          ops.push(api.entries.create(data));
        }
      }

      await Promise.all(ops);
      await loadMonth();
      setModalDate(null);
      toast({ title: 'Ore salvate' });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: err instanceof Error ? err.message : 'Errore nel salvataggio',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Navigazione mese ──────────────────────────────────────────────────────

  const changeMonth = (delta: number) => {
    setCurrentMonth((m) => {
      const d = new Date(m.year, m.month - 1 + delta);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  // ── Helpers rendering ─────────────────────────────────────────────────────

  const todayParts = today.split('-').map(Number); // [Y, M, D]

  function isClickable(day: number) {
    const { year, month } = currentMonth;
    const cellDate = new Date(year, month - 1, day);
    const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
    return cellDate <= todayDate;
  }

  function cellDateStr(day: number) {
    const { year, month } = currentMonth;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const totalMonth = monthEntries.reduce((s, e) => s + e.hours, 0);
  const modalTotal = slots.reduce((s, slot) => s + slot.hours, 0);
  const slotCountByLoc = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of slots) map[s.locId] = (map[s.locId] ?? 0) + 1;
    return map;
  }, [slots]);

  const modalDateLabel = modalDate
    ? new Date(modalDate + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30">

      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <SolkyLogo size="sm" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              Ciao, <span className="font-medium text-foreground">{user?.name}</span>
            </span>
            <Button variant="ghost" size="icon" onClick={logout} title="Esci" className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 space-y-4">

        {/* Navigazione mese */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-lg font-semibold">
              {MONTHS_IT[currentMonth.month - 1]} {currentMonth.year}
            </p>
            {totalMonth > 0 && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> {formatHours(totalMonth)} totali
              </p>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Griglia calendario */}
        <div className="rounded-xl border bg-background shadow-sm overflow-hidden">

          {/* Intestazioni giorni settimana */}
          <div className="grid grid-cols-7 border-b">
            {DAYS_IT.map((d, i) => (
              <div
                key={d}
                className={cn(
                  'py-2 text-center text-xs font-medium text-muted-foreground',
                  i >= 5 && 'text-rose-400'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Celle dei giorni */}
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="border-b border-r p-1 min-h-[80px] bg-muted/20 last:border-r-0" />;
              }

              const dateStr = cellDateStr(day);
              const isToday = dateStr === today;
              const clickable = isClickable(day);
              const dayEntries = entriesByDate[dateStr] ?? [];
              const hasEntries = dayEntries.length > 0;
              const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
              const colIdx = idx % 7; // 0=Lun … 6=Dom

              return (
                <div
                  key={dateStr}
                  onClick={() => clickable && openModal(dateStr)}
                  className={cn(
                    'border-b border-r min-h-[80px] p-1.5 flex flex-col gap-1 transition-colors last:border-r-0',
                    colIdx >= 5 && 'bg-muted/10',
                    clickable ? 'cursor-pointer hover:bg-accent/50' : 'opacity-40 cursor-default',
                    isToday && 'ring-2 ring-inset ring-primary',
                  )}
                >
                  {/* Numero del giorno */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : colIdx >= 5
                          ? 'text-rose-500'
                          : 'text-foreground'
                      )}
                    >
                      {day}
                    </span>
                    {/* Bottone + se clickable e non ha entries, oppure mostra ore totali */}
                    {clickable && !hasEntries && (
                      <Plus className="h-3.5 w-3.5 text-muted-foreground/60" />
                    )}
                    {hasEntries && (
                      <span className="text-[10px] font-semibold text-primary">{formatHours(dayTotal)}</span>
                    )}
                  </div>

                  {/* Badge location */}
                  <div className="flex flex-col gap-0.5">
                    {dayEntries.map((e) => {
                      const color = colorByLocId[e.locationId] ?? LOC_COLORS[0];
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            'flex items-center gap-1 rounded px-1 py-0.5',
                            color.bg
                          )}
                        >
                          <div className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', color.dot)} />
                          <span className={cn('text-[9px] font-medium leading-tight truncate', color.text)}>
                            {e.locationName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legenda location */}
        {locations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {locations.map((loc, i) => {
              const color = LOC_COLORS[i % LOC_COLORS.length];
              return (
                <div key={loc.id} className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', color.bg, color.text)}>
                  <div className={cn('h-2 w-2 rounded-full', color.dot)} />
                  {loc.name}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── MODALE ───────────────────────────────────────────────────────── */}
      <Dialog open={!!modalDate} onOpenChange={(open) => !open && setModalDate(null)}>
        <DialogContent className="max-w-md w-full flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="capitalize">{modalDateLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1 overflow-y-auto flex-1 min-h-0">

            {/* Tags location */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Tocca per aggiungere una location
              </p>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc, i) => {
                  const count = slotCountByLoc[loc.id] ?? 0;
                  const color = LOC_COLORS[i % LOC_COLORS.length];
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => addSlot(loc.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ring-2',
                        count > 0
                          ? [color.bg, color.text, color.ring]
                          : 'bg-muted text-muted-foreground ring-transparent hover:ring-border'
                      )}
                    >
                      <div className={cn('h-2 w-2 rounded-full', count > 0 ? color.dot : 'bg-muted-foreground/40')} />
                      {loc.name}
                      {count > 1 && (
                        <span className="rounded-full bg-white/40 px-1.5 text-xs font-bold">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slot inseriti */}
            {slots.length > 0 && (
              <div className="space-y-3">
                {slots.map((slot) => {
                  const loc = locations.find((l) => l.id === slot.locId);
                  const color = LOC_COLORS[locations.findIndex((l) => l.id === slot.locId) % LOC_COLORS.length];
                  return (
                    <div key={slot.key} className={cn('rounded-lg p-3 space-y-2', color.bg)}>
                      <div className={cn('flex items-center gap-1.5 text-sm font-semibold', color.text)}>
                        <div className={cn('h-2 w-2 rounded-full', color.dot)} />
                        {loc?.name}
                        <div className="ml-auto flex items-center gap-1">
                          {slot.hours > 0 && (
                            <Badge className="text-xs py-0" variant="secondary">
                              {formatHours(slot.hours)}
                            </Badge>
                          )}
                          <button
                            type="button"
                            onClick={() => removeSlot(slot.key)}
                            className="opacity-60 hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground block mb-1">Inizio</label>
                          <Input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => updateSlot(slot.key, 'startTime', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground block mb-1">Fine</label>
                          <Input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => updateSlot(slot.key, 'endTime', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {slot.startTime && slot.endTime && slot.hours === 0 && (
                        <p className="text-[10px] text-rose-500">L'orario di fine deve essere dopo l'inizio</p>
                      )}

                      <Input
                        placeholder="Note (opzionale)"
                        value={slot.notes}
                        onChange={(e) => updateSlot(slot.key, 'notes', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  );
                })}

                {modalTotal > 0 && (
                  <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Totale giornata
                    </span>
                    <span className="text-sm font-bold text-primary">{formatHours(modalTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {slots.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Tocca una location per aggiungere le ore
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalDate(null)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || slots.length === 0 || modalTotal === 0}
            >
              {saving ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
