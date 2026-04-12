import { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
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

      // ── Palette colori ─────────────────────────────────────────
      const C = {
        navy:      '1E3A5F',
        navyLight: '2563EB',
        white:     'FFFFFF',
        rowAlt:    'F0F4FA',
        sectionBg: 'E2EAF6',
        totalBg:   'FEF9C3',
        totalBold: 'D97706',
        border:    'CBD5E1',
        text:      '1E293B',
        muted:     '64748B',
      };

      // ── Helper stili ────────────────────────────────────────────
      const headerFill = (color: string): ExcelJS.Fill =>
        ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });

      const border = (color = C.border): Partial<ExcelJS.Borders> => ({
        top:    { style: 'thin', color: { argb: `FF${color}` } },
        bottom: { style: 'thin', color: { argb: `FF${color}` } },
        left:   { style: 'thin', color: { argb: `FF${color}` } },
        right:  { style: 'thin', color: { argb: `FF${color}` } },
      });

      const applyHeader = (row: ExcelJS.Row, bgColor: string, textColor = C.white) => {
        row.height = 22;
        row.eachCell((cell) => {
          cell.fill = headerFill(bgColor);
          cell.font = { bold: true, color: { argb: `FF${textColor}` }, size: 11 };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = border();
        });
      };

      const applyDataRow = (row: ExcelJS.Row, alt: boolean) => {
        row.height = 18;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = headerFill(alt ? C.rowAlt : C.white);
          cell.font = { color: { argb: `FF${C.text}` }, size: 10 };
          cell.alignment = { vertical: 'middle' };
          cell.border = border();
        });
      };

      // ── Workbook ────────────────────────────────────────────────
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Solky Care';
      wb.created = new Date();

      // ══════════════════════════════════════════════════════════
      // FOGLIO 1 — Riepilogo
      // ══════════════════════════════════════════════════════════
      const wsSummary = wb.addWorksheet('Riepilogo');
      wsSummary.columns = [
        { key: 'name',     width: 28 },
        { key: 'location', width: 22 },
        { key: 'hours',    width: 14 },
        { key: 'days',     width: 16 },
      ];

      // Titolo
      wsSummary.mergeCells('A1:D1');
      const titleCell = wsSummary.getCell('A1');
      titleCell.value = `Riepilogo Ore — ${monthLabel}`;
      titleCell.fill = headerFill(C.navy);
      titleCell.font = { bold: true, size: 14, color: { argb: `FF${C.white}` } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      wsSummary.getRow(1).height = 30;

      wsSummary.addRow([]); // riga vuota

      // Header colonne
      const sumHeader = wsSummary.addRow(['Dipendente', 'Location', 'Ore Totali', 'Giorni Lavorati']);
      applyHeader(sumHeader, C.navyLight);

      // Dati
      let lastUser = '';
      summary.forEach((r, i) => {
        const dataRow = wsSummary.addRow([r.userName, r.locationName, r.totalHours, r.days.size]);
        applyDataRow(dataRow, i % 2 === 0);
        // Evidenzia inizio nuovo utente
        if (r.userName !== lastUser) {
          dataRow.getCell(1).font = { bold: true, color: { argb: `FF${C.text}` }, size: 10 };
          lastUser = r.userName;
        }
        dataRow.getCell(3).numFmt = '0.00';
        dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      });

      wsSummary.addRow([]);

      // Totali per dipendente
      const userTotals: Record<string, number> = {};
      summary.forEach((r) => {
        userTotals[r.userName] = (userTotals[r.userName] ?? 0) + r.totalHours;
      });

      const totSectionRow = wsSummary.addRow(['Totali per Dipendente', '', '', '']);
      wsSummary.mergeCells(`A${totSectionRow.number}:D${totSectionRow.number}`);
      totSectionRow.height = 20;
      totSectionRow.getCell(1).fill = headerFill(C.sectionBg);
      totSectionRow.getCell(1).font = { bold: true, size: 11, color: { argb: `FF${C.navy}` } };
      totSectionRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      totSectionRow.getCell(1).border = border();

      Object.entries(userTotals).forEach(([name, tot], i) => {
        const tRow = wsSummary.addRow([name, '', tot, '']);
        applyDataRow(tRow, i % 2 === 0);
        tRow.getCell(1).font = { bold: true, color: { argb: `FF${C.text}` }, size: 10 };
        tRow.getCell(3).numFmt = '0.00';
        tRow.getCell(3).font = { bold: true, color: { argb: `FF${C.navyLight}` }, size: 10 };
        tRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      });

      wsSummary.views = [{ state: 'frozen', ySplit: 3 }];

      // ══════════════════════════════════════════════════════════
      // FOGLI UTENTE
      // ══════════════════════════════════════════════════════════
      const byUser = new Map<string, { name: string; entries: EntryRow[] }>();
      for (const e of rows as EntryRow[]) {
        const uid = e.user_id;
        if (!byUser.has(uid)) byUser.set(uid, { name: e.profiles?.name ?? uid, entries: [] });
        byUser.get(uid)!.entries.push(e);
      }

      const sortedUsers = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));

      for (const { name, entries } of sortedUsers) {
        const sheetName = name.replace(/[\\/*?[\]]/g, '').slice(0, 31);
        const ws = wb.addWorksheet(sheetName);

        ws.columns = [
          { key: 'date',     width: 14 },
          { key: 'location', width: 20 },
          { key: 'start',    width: 10 },
          { key: 'end',      width: 10 },
          { key: 'hours',    width: 10 },
          { key: 'notes',    width: 35 },
        ];

        // Titolo
        ws.mergeCells('A1:F1');
        const ut = ws.getCell('A1');
        ut.value = `${name} — ${monthLabel}`;
        ut.fill = headerFill(C.navy);
        ut.font = { bold: true, size: 14, color: { argb: `FF${C.white}` } };
        ut.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(1).height = 30;

        ws.addRow([]);

        // Header
        const colHeader = ws.addRow(['Data', 'Location', 'Inizio', 'Fine', 'Ore', 'Note']);
        applyHeader(colHeader, C.navyLight);

        // Dati giornalieri
        const sorted = [...entries].sort(
          (a, b) => a.date.localeCompare(b.date) || (a.locations?.name ?? '').localeCompare(b.locations?.name ?? '')
        );

        sorted.forEach((e, i) => {
          const dr = ws.addRow([
            e.date,
            e.locations?.name ?? '',
            e.start_time ?? '',
            e.end_time ?? '',
            e.hours,
            e.notes ?? '',
          ]);
          applyDataRow(dr, i % 2 === 0);
          dr.getCell(5).numFmt = '0.00';
          dr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
          dr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
          dr.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        });

        ws.addRow([]);

        // Totali per location
        const locTotals = new Map<string, number>();
        for (const e of entries) {
          const loc = e.locations?.name ?? '';
          locTotals.set(loc, (locTotals.get(loc) ?? 0) + e.hours);
        }

        const locSecRow = ws.addRow(['Totale per Location', '', '', '', '', '']);
        ws.mergeCells(`A${locSecRow.number}:F${locSecRow.number}`);
        locSecRow.height = 20;
        locSecRow.getCell(1).fill = headerFill(C.sectionBg);
        locSecRow.getCell(1).font = { bold: true, size: 11, color: { argb: `FF${C.navy}` } };
        locSecRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        locSecRow.getCell(1).border = border();

        Array.from(locTotals.entries()).forEach(([loc, tot], i) => {
          const lr = ws.addRow(['', loc, '', '', tot, '']);
          applyDataRow(lr, i % 2 === 0);
          lr.getCell(2).font = { bold: true, color: { argb: `FF${C.text}` }, size: 10 };
          lr.getCell(5).numFmt = '0.00';
          lr.getCell(5).font = { bold: true, color: { argb: `FF${C.navyLight}` }, size: 10 };
          lr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        });

        ws.addRow([]);

        // Totale generale
        const grandTotal = Array.from(locTotals.values()).reduce((a, b) => a + b, 0);
        const gtRow = ws.addRow(['Totale Ore', '', '', '', grandTotal, '']);
        ws.mergeCells(`A${gtRow.number}:D${gtRow.number}`);
        gtRow.height = 24;
        gtRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = headerFill(C.totalBg);
          cell.font = { bold: true, size: 12, color: { argb: `FF${C.totalBold}` } };
          cell.border = border(C.totalBold);
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        gtRow.getCell(5).numFmt = '0.00';

        ws.views = [{ state: 'frozen', ySplit: 3 }];
      }

      // ── Output ─────────────────────────────────────────────────
      const buf = await wb.xlsx.writeBuffer();

      reply
        .header('Content-Disposition', `attachment; filename="ore_${year}_${String(month).padStart(2, '0')}.xlsx"`)
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(buf);
    }
  );
};

export default entriesRoutes;
