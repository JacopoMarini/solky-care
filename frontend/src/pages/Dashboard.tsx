import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/api';
import { Location, WorkEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Plus, LogOut, Clock, MapPin } from 'lucide-react';
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
  return diff > 0 ? Math.round(diff / 60 * 100) / 100 : 0;
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

interface LocEntry {
  selected: boolean;
  startTime: string;
  endTime: string;
  hours: number;        // calcolato automaticamente
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
  const [locStates, setLocStates] = useState<Record<string, LocEntry>>({});
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
    // Carica entry esistenti per quella data
    let existing: WorkEntry[] = [];
    try { existing = await api.entries.forDate(dateStr); } catch { /* nessuna entry */ }

    const initialStates: Record<string, LocEntry> = {};
    for (const loc of locations) {
      const found = existing.find((e) => e.locationId === loc.id);
      initialStates[loc.id] = {
        selected: !!found,
        startTime: found?.start_time ?? '',
        endTime: found?.end_time ?? '',
        hours: found?.hours ?? 0,
        notes: found?.notes ?? '',
        existingId: found?.id,
      };
    }
    setLocStates(initialStates);
    setModalDate(dateStr);
  }, [locations]);

  // ── Toggle selezione location nel modale ──────────────────────────────────

  const toggleLocation = (locId: string) => {
    setLocStates((prev) => ({
      ...prev,
      [locId]: { ...prev[locId], selected: !prev[locId].selected },
    }));
  };

  // ── Aggiornamento orari ───────────────────────────────────────────────────

  const updateTime = (locId: string, field: 'startTime' | 'endTime', value: string) => {
    setLocStates((prev) => {
      const updated = { ...prev[locId], [field]: value };
      updated.hours = calcHours(
        field === 'startTime' ? value : updated.startTime,
        field === 'endTime' ? value : updated.endTime,
      );
      return { ...prev, [locId]: updated };
    });
  };

  // ── Salvataggio ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!modalDate) return;
    setSaving(true);
    try {
      const ops = Object.entries(locStates).map(async ([locId, state]) => {
        if (state.selected && state.hours > 0) {
          await api.entries.upsert({
            locationId: locId,
            date: modalDate,
            hours: state.hours,
            start_time: state.startTime || undefined,
            end_time: state.endTime || undefined,
            notes: state.notes || undefined,
          });
        } else if (!state.selected && state.existingId) {
          // Era presente, ora deselezionato → elimina
          await api.entries.delete(state.existingId);
        }
      });
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
  const selectedCount = Object.values(locStates).filter((s) => s.selected).length;
  const modalTotal = Object.values(locStates)
    .filter((s) => s.selected)
    .reduce((s, e) => s + e.hours, 0);

  const modalDateLabel = modalDate
    ? new Date(modalDate + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30">

      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">Solky Care</h1>
            <p className="text-xs text-muted-foreground">Ciao, {user?.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="Esci">
            <LogOut className="h-4 w-4" />
          </Button>
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
                <Clock className="h-3 w-3" /> {totalMonth}h totali
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
                      <span className="text-[10px] font-semibold text-primary">{dayTotal}h</span>
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
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="capitalize">{modalDateLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">

            {/* Tags location */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Seleziona dove hai lavorato
              </p>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc, i) => {
                  const state = locStates[loc.id];
                  const color = LOC_COLORS[i % LOC_COLORS.length];
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => toggleLocation(loc.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ring-2',
                        state?.selected
                          ? [color.bg, color.text, color.ring]
                          : 'bg-muted text-muted-foreground ring-transparent hover:ring-border'
                      )}
                    >
                      <div className={cn('h-2 w-2 rounded-full', state?.selected ? color.dot : 'bg-muted-foreground/40')} />
                      {loc.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orari per ogni location selezionata */}
            {selectedCount > 0 && (
              <div className="space-y-3">
                {locations
                  .filter((loc) => locStates[loc.id]?.selected)
                  .map((loc) => {
                    const state = locStates[loc.id];
                    const color = LOC_COLORS[locations.indexOf(loc) % LOC_COLORS.length];
                    return (
                      <div key={loc.id} className={cn('rounded-lg p-3 space-y-2', color.bg)}>
                        <div className={cn('flex items-center gap-1.5 text-sm font-semibold', color.text)}>
                          <div className={cn('h-2 w-2 rounded-full', color.dot)} />
                          {loc.name}
                          {state.hours > 0 && (
                            <Badge className="ml-auto text-xs py-0" variant="secondary">
                              {state.hours}h
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Inizio</label>
                            <Input
                              type="time"
                              value={state.startTime}
                              onChange={(e) => updateTime(loc.id, 'startTime', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Fine</label>
                            <Input
                              type="time"
                              value={state.endTime}
                              onChange={(e) => updateTime(loc.id, 'endTime', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>

                        {state.startTime && state.endTime && state.hours === 0 && (
                          <p className="text-[10px] text-rose-500">L'orario di fine deve essere dopo l'inizio</p>
                        )}

                        <Input
                          placeholder="Note (opzionale)"
                          value={state.notes}
                          onChange={(e) =>
                            setLocStates((p) => ({ ...p, [loc.id]: { ...p[loc.id], notes: e.target.value } }))
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    );
                  })}

                {/* Totale giornata */}
                {modalTotal > 0 && (
                  <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Totale giornata
                    </span>
                    <span className="text-sm font-bold text-primary">{modalTotal}h</span>
                  </div>
                )}
              </div>
            )}

            {selectedCount === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Seleziona almeno una location per inserire le ore
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalDate(null)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || selectedCount === 0 || modalTotal === 0}
            >
              {saving ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
