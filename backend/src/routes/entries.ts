import { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { WorkEntry, Location, Notification } from '../lib/db';

type PopulatedUser     = { _id: mongoose.Types.ObjectId; name: string; email: string };
type PopulatedLocation = { _id: mongoose.Types.ObjectId; name: string };
type PopulatedEntry = {
  _id:         mongoose.Types.ObjectId;
  user_id:     PopulatedUser;
  location_id: PopulatedLocation;
  date:        string;
  hours:       number;
  start_time:  string | null;
  end_time:    string | null;
  notes:       string;
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

      const entries = await WorkEntry
        .find({ user_id: req.user.id, date })
        .populate('location_id', 'name')
        .lean() as unknown as PopulatedEntry[];

      return entries.map((e) => ({
        id:           String(e._id),
        date:         e.date,
        hours:        e.hours,
        start_time:   e.start_time,
        end_time:     e.end_time,
        notes:        e.notes,
        locationId:   String(e.location_id?._id ?? e.location_id),
        locationName: (e.location_id as PopulatedLocation)?.name,
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

      const entries = await WorkEntry
        .find({ user_id: req.user.id, date: { $regex: `^${prefix}` } })
        .populate('location_id', 'name')
        .sort({ date: 1 })
        .lean() as unknown as PopulatedEntry[];

      return entries.map((e) => ({
        id:           String(e._id),
        date:         e.date,
        hours:        e.hours,
        start_time:   e.start_time,
        end_time:     e.end_time,
        notes:        e.notes,
        locationId:   String(e.location_id?._id ?? e.location_id),
        locationName: (e.location_id as PopulatedLocation)?.name,
      }));
    }
  );

  // POST /api/entries — crea nuova entry
  fastify.post<{
    Body: { locationId: string; date: string; hours: number; start_time?: string; end_time?: string; notes?: string };
  }>('/', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { locationId, date, hours, start_time, end_time, notes } = req.body;
    if (!locationId || !date || hours == null)
      return reply.status(400).send({ error: 'locationId, date e hours obbligatori' });
    if (hours <= 0 || hours > 24)
      return reply.status(400).send({ error: 'Ore non valide (0-24)' });

    const entry = await new WorkEntry({
      user_id:     req.user.id,
      location_id: locationId,
      date,
      hours,
      start_time:  start_time ?? null,
      end_time:    end_time ?? null,
      notes:       notes ?? '',
    }).save();

    const loc = await Location.findById(locationId).lean();
    await new Notification({
      type:              'hours_added',
      trigger_user_id:   req.user.id,
      trigger_user_name: req.user.name,
      meta:              { date, hours, locationName: (loc as any)?.name ?? locationId },
    }).save();

    return { id: String(entry._id) };
  });

  // PATCH /api/entries/:id — aggiorna entry esistente
  fastify.patch<{
    Params: { id: string };
    Body: { hours?: number; start_time?: string; end_time?: string; notes?: string };
  }>('/:id', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { hours, start_time, end_time, notes } = req.body;

    const entry = await WorkEntry.findById(req.params.id).lean();
    if (!entry) return reply.status(404).send({ error: 'Entry non trovata' });
    if (String((entry as any).user_id) !== req.user.id && req.user.role !== 'admin')
      return reply.status(403).send({ error: 'Non autorizzato' });

    const updates: Record<string, unknown> = {};
    if (hours != null) updates.hours = hours;
    if (start_time !== undefined) updates.start_time = start_time || null;
    if (end_time !== undefined)   updates.end_time   = end_time || null;
    if (notes !== undefined)      updates.notes      = notes;

    await WorkEntry.findByIdAndUpdate(req.params.id, { $set: updates });
    return { success: true };
  });

  // DELETE /api/entries/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const entry = await WorkEntry.findById(req.params.id).lean();
      if (!entry) return reply.status(404).send({ error: 'Entry non trovata' });

      if (String((entry as any).user_id) !== req.user.id && req.user.role !== 'admin')
        return reply.status(403).send({ error: 'Non autorizzato' });

      await WorkEntry.findByIdAndDelete(req.params.id);
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

      const entries = await WorkEntry
        .find({ date: { $regex: `^${prefix}` } })
        .populate('user_id', 'name email')
        .populate('location_id', 'name')
        .lean() as unknown as PopulatedEntry[];

      const map = new Map<string, {
        userId: string; userName: string; userEmail: string;
        locationName: string; totalHours: number; days: Set<string>;
      }>();

      for (const e of entries) {
        const uid = String(e.user_id?._id ?? e.user_id);
        const lid = String(e.location_id?._id ?? e.location_id);
        const key = `${uid}__${lid}`;
        if (!map.has(key)) {
          map.set(key, {
            userId:       uid,
            userName:     (e.user_id as PopulatedUser)?.name ?? '',
            userEmail:    (e.user_id as PopulatedUser)?.email ?? '',
            locationName: (e.location_id as PopulatedLocation)?.name ?? '',
            totalHours:   0,
            days:         new Set(),
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

      const entries = await WorkEntry
        .find({ date: { $regex: `^${prefix}` } })
        .populate('user_id', 'name email')
        .populate('location_id', 'name')
        .sort({ date: 1 })
        .lean() as unknown as PopulatedEntry[];

      return entries.map((e) => ({
        userName:     (e.user_id as PopulatedUser)?.name ?? '',
        userEmail:    (e.user_id as PopulatedUser)?.email ?? '',
        date:         e.date,
        locationName: (e.location_id as PopulatedLocation)?.name ?? '',
        hours:        e.hours,
        notes:        e.notes ?? '',
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

      const prefix     = `${year}-${String(month).padStart(2, '0')}`;
      const monthLabel = `${String(month).padStart(2, '0')}/${year}`;

      const rows = await WorkEntry
        .find({ date: { $regex: `^${prefix}` } })
        .populate('user_id', 'name email')
        .populate('location_id', 'name')
        .lean() as unknown as PopulatedEntry[];

      // Aggrega per riepilogo
      const summaryMap = new Map<string, { userName: string; locationName: string; totalHours: number; days: Set<string> }>();
      for (const e of rows) {
        const uid = String(e.user_id?._id ?? e.user_id);
        const lid = String(e.location_id?._id ?? e.location_id);
        const key = `${uid}__${lid}`;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            userName:     (e.user_id as PopulatedUser)?.name ?? '',
            locationName: (e.location_id as PopulatedLocation)?.name ?? '',
            totalHours:   0,
            days:         new Set(),
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

      const headerFill = (color: string): ExcelJS.Fill =>
        ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });

      const border = (color = C.border): Partial<ExcelJS.Borders> => ({
        top:    { style: 'thin', color: { argb: `FF${color}` } },
        bottom: { style: 'thin', color: { argb: `FF${color}` } },
        left:   { style: 'thin', color: { argb: `FF${color}` } },
        right:  { style: 'thin', color: { argb: `FF${color}` } },
      });

      const applyHeader = (row: ExcelJS.Row, bgColor: string, textColor = C.white) => {
        row.height = 28;
        row.eachCell((cell) => {
          cell.fill = headerFill(bgColor);
          cell.font = { bold: true, color: { argb: `FF${textColor}` }, size: 14 };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = border();
        });
      };

      const applyDataRow = (row: ExcelJS.Row, alt: boolean) => {
        row.height = 22;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = headerFill(alt ? C.rowAlt : C.white);
          cell.font = { color: { argb: `FF${C.text}` }, size: 13 };
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

      wsSummary.mergeCells('A1:D1');
      const titleCell = wsSummary.getCell('A1');
      titleCell.value = `Riepilogo Ore — ${monthLabel}`;
      titleCell.fill = headerFill(C.navy);
      titleCell.font = { bold: true, size: 18, color: { argb: `FF${C.white}` } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      wsSummary.getRow(1).height = 36;

      wsSummary.addRow([]);

      const sumHeader = wsSummary.addRow(['Dipendente', 'Location', 'Ore Totali', 'Giorni Lavorati']);
      applyHeader(sumHeader, C.navyLight);

      let lastUser = '';
      summary.forEach((r, i) => {
        const dataRow = wsSummary.addRow([r.userName, r.locationName, r.totalHours, r.days.size]);
        applyDataRow(dataRow, i % 2 === 0);
        if (r.userName !== lastUser) {
          dataRow.getCell(1).font = { bold: true, color: { argb: `FF${C.text}` }, size: 13 };
          lastUser = r.userName;
        }
        dataRow.getCell(3).numFmt = '0.00';
        dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      });

      wsSummary.addRow([]);

      const userTotals: Record<string, number> = {};
      summary.forEach((r) => { userTotals[r.userName] = (userTotals[r.userName] ?? 0) + r.totalHours; });

      const totSectionRow = wsSummary.addRow(['Totali per Dipendente', '', '', '']);
      wsSummary.mergeCells(`A${totSectionRow.number}:D${totSectionRow.number}`);
      totSectionRow.height = 20;
      totSectionRow.getCell(1).fill = headerFill(C.sectionBg);
      totSectionRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${C.navy}` } };
      totSectionRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      totSectionRow.getCell(1).border = border();

      Object.entries(userTotals).forEach(([name, tot], i) => {
        const tRow = wsSummary.addRow([name, '', tot, '']);
        applyDataRow(tRow, i % 2 === 0);
        tRow.getCell(1).font = { bold: true, color: { argb: `FF${C.text}` }, size: 13 };
        tRow.getCell(3).numFmt = '0.00';
        tRow.getCell(3).font = { bold: true, color: { argb: `FF${C.navyLight}` }, size: 13 };
        tRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      });

      wsSummary.views = [{ state: 'frozen', ySplit: 3 }];

      // ══════════════════════════════════════════════════════════
      // FOGLI UTENTE
      // ══════════════════════════════════════════════════════════
      const byUser = new Map<string, { name: string; entries: PopulatedEntry[] }>();
      for (const e of rows) {
        const uid = String(e.user_id?._id ?? e.user_id);
        const uname = (e.user_id as PopulatedUser)?.name ?? uid;
        if (!byUser.has(uid)) byUser.set(uid, { name: uname, entries: [] });
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

        ws.mergeCells('A1:F1');
        const ut = ws.getCell('A1');
        ut.value = `${name} — ${monthLabel}`;
        ut.fill = headerFill(C.navy);
        ut.font = { bold: true, size: 18, color: { argb: `FF${C.white}` } };
        ut.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(1).height = 36;

        ws.addRow([]);

        const colHeader = ws.addRow(['Data', 'Location', 'Inizio', 'Fine', 'Ore', 'Note']);
        applyHeader(colHeader, C.navyLight);

        const sorted = [...entries].sort(
          (a, b) => a.date.localeCompare(b.date) ||
            ((a.location_id as PopulatedLocation)?.name ?? '').localeCompare((b.location_id as PopulatedLocation)?.name ?? '')
        );

        sorted.forEach((e, i) => {
          const dr = ws.addRow([
            e.date,
            (e.location_id as PopulatedLocation)?.name ?? '',
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

        const locTotals = new Map<string, number>();
        for (const e of entries) {
          const loc = (e.location_id as PopulatedLocation)?.name ?? '';
          locTotals.set(loc, (locTotals.get(loc) ?? 0) + e.hours);
        }

        const locSecRow = ws.addRow(['Totale per Location', '', '', '', '', '']);
        ws.mergeCells(`A${locSecRow.number}:F${locSecRow.number}`);
        locSecRow.height = 20;
        locSecRow.getCell(1).fill = headerFill(C.sectionBg);
        locSecRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${C.navy}` } };
        locSecRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        locSecRow.getCell(1).border = border();

        Array.from(locTotals.entries()).forEach(([loc, tot], i) => {
          const lr = ws.addRow(['', loc, '', '', tot, '']);
          applyDataRow(lr, i % 2 === 0);
          lr.getCell(2).font = { bold: true, color: { argb: `FF${C.text}` }, size: 13 };
          lr.getCell(5).numFmt = '0.00';
          lr.getCell(5).font = { bold: true, color: { argb: `FF${C.navyLight}` }, size: 13 };
          lr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        });

        ws.addRow([]);

        const grandTotal = Array.from(locTotals.values()).reduce((a, b) => a + b, 0);
        const gtRow = ws.addRow(['Totale Ore', '', '', '', grandTotal, '']);
        ws.mergeCells(`A${gtRow.number}:D${gtRow.number}`);
        gtRow.height = 24;
        gtRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = headerFill(C.totalBg);
          cell.font = { bold: true, size: 15, color: { argb: `FF${C.totalBold}` } };
          cell.border = border(C.totalBold);
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        gtRow.getCell(5).numFmt = '0.00';

        ws.views = [{ state: 'frozen', ySplit: 3 }];
      }

      const buf = await wb.xlsx.writeBuffer();
      reply
        .header('Content-Disposition', `attachment; filename="ore_${year}_${String(month).padStart(2, '0')}.xlsx"`)
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(buf);
    }
  );
};

export default entriesRoutes;
