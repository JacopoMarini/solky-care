import { FastifyPluginAsync } from 'fastify';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

type EntryRow = {
  id: string;
  user_id: string;
  location_id: string;
  date: string;
  hours: number;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  profiles?: { name: string; email: string } | null;
  locations?: { name: string } | null;
};

const entriesRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── UTENTE ───────────────────────────────────────────────

  // GET /api/entries/my?date=YYYY-MM-DD
  fastify.get<{ Querystring: { date: string } }>(
    '/my',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const { date } = req.query;
      if (!date) return reply.status(400).send({ error: 'Data obbligatoria' });

      const { data } = await supabase
        .from('work_entries')
        .select('*, locations(name)')
        .eq('user_id', req.user.id)
        .eq('date', date);

      return (data as EntryRow[] ?? []).map((e) => ({
        id: e.id,
        date: e.date,
        hours: e.hours,
        start_time: e.start_time,
        end_time: e.end_time,
        notes: e.notes,
        locationId: e.location_id,
        locationName: e.locations?.name,
      }));
    }
  );

  // GET /api/entries/my/month?year=YYYY&month=MM
  fastify.get<{ Querystring: { year: string; month: string } }>(
    '/my/month',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const { year, month } = req.query;
      if (!year || !month) return reply.status(400).send({ error: 'Anno e mese obbligatori' });

      const prefix = `${year}-${String(month).padStart(2, '0')}`;

      const { data } = await supabase
        .from('work_entries')
        .select('*, locations(name)')
        .eq('user_id', req.user.id)
        .like('date', `${prefix}%`)
        .order('date');

      return (data as EntryRow[] ?? []).map((e) => ({
        id: e.id,
        date: e.date,
        hours: e.hours,
        start_time: e.start_time,
        end_time: e.end_time,
        notes: e.notes,
        locationId: e.location_id,
        locationName: e.locations?.name,
      }));
    }
  );

  // POST /api/entries — crea o aggiorna (upsert)
  fastify.post<{
    Body: {
      locationId: string;
      date: string;
      hours: number;
      start_time?: string;
      end_time?: string;
      notes?: string;
    };
  }>('/', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { locationId, date, hours, start_time, end_time, notes } = req.body;
    if (!locationId || !date || hours == null)
      return reply.status(400).send({ error: 'locationId, date e hours obbligatori' });

    if (hours < 0 || hours > 24)
      return reply.status(400).send({ error: 'Ore non valide (0-24)' });

    if (hours === 0) {
      await supabase
        .from('work_entries')
        .delete()
        .eq('user_id', req.user.id)
        .eq('location_id', locationId)
        .eq('date', date);
      return { deleted: true };
    }

    // Controlla se è un nuovo inserimento (per la notifica)
    const { count } = await supabase
      .from('work_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('location_id', locationId)
      .eq('date', date);
    const isNew = (count ?? 0) === 0;

    const { data, error } = await supabase
      .from('work_entries')
      .upsert(
        {
          user_id: req.user.id,
          location_id: locationId,
          date,
          hours,
          start_time: start_time ?? null,
          end_time: end_time ?? null,
          notes: notes ?? '',
        },
        { onConflict: 'user_id,location_id,date' }
      )
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Notifica solo al primo inserimento
    if (isNew) {
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', locationId)
        .single();
      await supabase.from('notifications').insert({
        type: 'hours_added',
        trigger_user_id: req.user.id,
        trigger_user_name: req.user.name,
        meta: { date, hours, locationName: loc?.name ?? locationId },
      });
    }

    return { id: data.id, upserted: true };
  });

  // DELETE /api/entries/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const { data: entry } = await supabase
        .from('work_entries')
        .select('user_id')
        .eq('id', req.params.id)
        .single();

      if (!entry) return reply.status(404).send({ error: 'Entry non trovata' });

      if (entry.user_id !== req.user.id && req.user.role !== 'admin')
        return reply.status(403).send({ error: 'Non autorizzato' });

      await supabase.from('work_entries').delete().eq('id', req.params.id);
      return { success: true };
    }
  );

  // ─── ADMIN ────────────────────────────────────────────────

  // GET /api/entries/admin/monthly?year=YYYY&month=MM
  fastify.get<{ Querystring: { year: string; month: string } }>(
    '/admin/monthly',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { year, month } = req.query;
      if (!year || !month) return reply.status(400).send({ error: 'Anno e mese obbligatori' });

      const prefix = `${year}-${String(month).padStart(2, '0')}`;

      const { data } = await supabase
        .from('work_entries')
        .select('*, profiles(name, email), locations(name)')
        .like('date', `${prefix}%`);

      // Aggrega in memoria: per utente + location
      const map = new Map<string, { userId: string; userName: string; userEmail: string; locationName: string; totalHours: number; days: Set<string> }>();

      for (const e of data ?? []) {
        const key = `${e.user_id}__${e.location_id}`;
        if (!map.has(key)) {
          map.set(key, {
            userId: e.user_id,
            userName: (e.profiles as any)?.name ?? '',
            userEmail: (e.profiles as any)?.email ?? '',
            locationName: (e.locations as any)?.name ?? '',
            totalHours: 0,
            days: new Set(),
          });
        }
        const row = map.get(key)!;
        row.totalHours += e.hours;
        row.days.add(e.date);
      }

      return Array.from(map.values())
        .map((r) => ({ ...r, daysWorked: r.days.size, days: undefined }))
        .sort((a, b) => a.userName.localeCompare(b.userName) || a.locationName.localeCompare(b.locationName));
    }
  );

  // GET /api/entries/admin/detail?year=YYYY&month=MM
  fastify.get<{ Querystring: { year: string; month: string } }>(
    '/admin/detail',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { year, month } = req.query;
      if (!year || !month) return reply.status(400).send({ error: 'Anno e mese obbligatori' });

      const prefix = `${year}-${String(month).padStart(2, '0')}`;

      const { data } = await supabase
        .from('work_entries')
        .select('*, profiles(name, email), locations(name)')
        .like('date', `${prefix}%`)
        .order('date');

      return (data as EntryRow[] ?? []).map((e) => ({
        userName: e.profiles?.name ?? '',
        userEmail: e.profiles?.email ?? '',
        date: e.date,
        locationName: e.locations?.name ?? '',
        hours: e.hours,
        notes: e.notes ?? '',
      }));
    }
  );

  // GET /api/entries/admin/export?year=YYYY&month=MM
  fastify.get<{ Querystring: { year: string; month: string } }>(
    '/admin/export',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { year, month } = req.query;
      if (!year || !month) return reply.status(400).send({ error: 'Anno e mese obbligatori' });

      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const monthLabel = `${String(month).padStart(2, '0')}/${year}`;

      const { data } = await supabase
        .from('work_entries')
        .select('*, profiles(name, email), locations(name)')
        .like('date', `${prefix}%`)
        .order('date');

      const rows = data ?? [];

      // Aggrega per riepilogo
      const summaryMap = new Map<string, { userName: string; locationName: string; totalHours: number; days: Set<string> }>();
      for (const e of rows) {
        const key = `${e.user_id}__${e.location_id}`;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            userName: (e.profiles as any)?.name ?? '',
            locationName: (e.locations as any)?.name ?? '',
            totalHours: 0,
            days: new Set(),
          });
        }
        const row = summaryMap.get(key)!;
        row.totalHours += e.hours;
        row.days.add(e.date);
      }

      const summary = Array.from(summaryMap.values()).sort(
        (a, b) => a.userName.localeCompare(b.userName) || a.locationName.localeCompare(b.locationName)
      );

      const wb = XLSX.utils.book_new();

      // Foglio 1 — Riepilogo generale
      const userTotals: Record<string, number> = {};
      summary.forEach((r) => {
        userTotals[r.userName] = (userTotals[r.userName] ?? 0) + r.totalHours;
      });

      const summaryRows: (string | number)[][] = [
        [`Riepilogo Ore — ${monthLabel}`],
        [],
        ['Dipendente', 'Location', 'Ore Totali', 'Giorni Lavorati'],
        ...summary.map((r) => [r.userName, r.locationName, r.totalHours, r.days.size]),
        [],
        ['TOTALI PER DIPENDENTE', '', '', ''],
        ...Object.entries(userTotals).map(([name, tot]) => [name, '', tot, '']),
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Riepilogo');

      // Un foglio per ogni utente con il dettaglio giornaliero
      const byUser = new Map<string, { name: string; entries: EntryRow[] }>();
      for (const e of rows as EntryRow[]) {
        const uid = e.user_id;
        if (!byUser.has(uid)) {
          byUser.set(uid, { name: e.profiles?.name ?? uid, entries: [] });
        }
        byUser.get(uid)!.entries.push(e);
      }

      // Ordina utenti per nome
      const sortedUsers = Array.from(byUser.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const { name, entries } of sortedUsers) {
        // Calcola totali per location per questo utente
        const locTotals = new Map<string, number>();
        for (const e of entries) {
          const loc = e.locations?.name ?? '';
          locTotals.set(loc, (locTotals.get(loc) ?? 0) + e.hours);
        }

        const userRows: (string | number)[][] = [
          [`${name} — ${monthLabel}`],
          [],
          ['Data', 'Location', 'Inizio', 'Fine', 'Ore', 'Note'],
          ...entries
            .sort((a, b) => a.date.localeCompare(b.date) || (a.locations?.name ?? '').localeCompare(b.locations?.name ?? ''))
            .map((e) => [
              e.date,
              e.locations?.name ?? '',
              e.start_time ?? '',
              e.end_time ?? '',
              e.hours,
              e.notes ?? '',
            ]),
          [],
          ['TOTALE PER LOCATION', '', '', '', '', ''],
          ...Array.from(locTotals.entries()).map(([loc, tot]) => ['', loc, '', '', tot, '']),
          [],
          ['TOTALE ORE', '', '', '', Array.from(locTotals.values()).reduce((a, b) => a + b, 0), ''],
        ];

        const ws = XLSX.utils.aoa_to_sheet(userRows);
        ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];

        // Nome foglio: max 31 caratteri (limite Excel), caratteri speciali rimossi
        const sheetName = name.replace(/[\\/*?[\]]/g, '').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      reply
        .header('Content-Disposition', `attachment; filename="ore_${year}_${String(month).padStart(2, '0')}.xlsx"`)
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(buf);
    }
  );
};

export default entriesRoutes;
