import { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import * as XLSX from 'xlsx';
import { WorkEntry } from '../models/WorkEntry';
import { Notification } from '../models/Notification';
import { Location } from '../models/Location';

const entriesRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── UTENTE ───────────────────────────────────────────────

  // GET /api/entries/my?date=YYYY-MM-DD
  fastify.get<{ Querystring: { date: string } }>(
    '/my',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const { date } = req.query;
      if (!date) return reply.status(400).send({ error: 'Data obbligatoria' });

      const entries = await WorkEntry.find({ userId: req.user.id, date })
        .populate('locationId', 'name')
        .lean();

      return entries.map((e) => ({
        id: e._id,
        date: e.date,
        hours: e.hours,
        startTime: e.startTime,
        endTime: e.endTime,
        notes: e.notes,
        locationId: (e.locationId as any)._id,
        locationName: (e.locationId as any).name,
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
      const entries = await WorkEntry.find({
        userId: req.user.id,
        date: { $regex: `^${prefix}` },
      })
        .populate('locationId', 'name')
        .sort({ date: 1 })
        .lean();

      return entries.map((e) => ({
        id: e._id,
        date: e.date,
        hours: e.hours,
        startTime: e.startTime,
        endTime: e.endTime,
        notes: e.notes,
        locationId: (e.locationId as any)._id,
        locationName: (e.locationId as any).name,
      }));
    }
  );

  // POST /api/entries — crea o aggiorna (upsert)
  fastify.post<{
    Body: { locationId: string; date: string; hours: number; startTime?: string; endTime?: string; notes?: string };
  }>('/', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { locationId, date, hours, startTime, endTime, notes } = req.body;
    if (!locationId || !date || hours == null)
      return reply.status(400).send({ error: 'locationId, date e hours obbligatori' });

    if (hours < 0 || hours > 24)
      return reply.status(400).send({ error: 'Ore non valide (0-24)' });

    if (hours === 0) {
      await WorkEntry.deleteOne({
        userId: req.user.id,
        locationId: new Types.ObjectId(locationId),
        date,
      });
      return { deleted: true };
    }

    const isNew = !(await WorkEntry.exists({
      userId: req.user.id,
      locationId: new Types.ObjectId(locationId),
      date,
    }));

    const entry = await WorkEntry.findOneAndUpdate(
      { userId: req.user.id, locationId: new Types.ObjectId(locationId), date },
      { hours, startTime: startTime ?? null, endTime: endTime ?? null, notes: notes ?? '' },
      { upsert: true, new: true }
    );

    // Notifica solo al primo inserimento (non sugli aggiornamenti)
    if (isNew) {
      const loc = await Location.findById(locationId).lean();
      await Notification.create({
        type: 'hours_added',
        triggerUserId: req.user.id,
        triggerUserName: req.user.name,
        meta: { date, hours, locationName: loc?.name ?? locationId },
      });
    }

    return { id: entry._id, upserted: true };
  });

  // DELETE /api/entries/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const entry = await WorkEntry.findById(req.params.id);
      if (!entry) return reply.status(404).send({ error: 'Entry non trovata' });

      if (entry.userId.toString() !== req.user.id && req.user.role !== 'admin')
        return reply.status(403).send({ error: 'Non autorizzato' });

      await entry.deleteOne();
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

      const rows = await WorkEntry.aggregate([
        { $match: { date: { $regex: `^${prefix}` } } },
        {
          $group: {
            _id: { userId: '$userId', locationId: '$locationId' },
            totalHours: { $sum: '$hours' },
            daysWorked: { $addToSet: '$date' },
          },
        },
        {
          $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' },
        },
        {
          $lookup: {
            from: 'locations',
            localField: '_id.locationId',
            foreignField: '_id',
            as: 'location',
          },
        },
        { $unwind: '$user' },
        { $unwind: '$location' },
        {
          $project: {
            _id: 0,
            userId: '$user._id',
            userName: '$user.name',
            userEmail: '$user.email',
            locationName: '$location.name',
            totalHours: 1,
            daysWorked: { $size: '$daysWorked' },
          },
        },
        { $sort: { userName: 1, locationName: 1 } },
      ]);

      return rows;
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
      const entries = await WorkEntry.find({ date: { $regex: `^${prefix}` } })
        .populate('userId', 'name email')
        .populate('locationId', 'name')
        .sort({ date: 1 })
        .lean();

      return entries.map((e) => ({
        userName: (e.userId as any).name,
        userEmail: (e.userId as any).email,
        date: e.date,
        locationName: (e.locationId as any).name,
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

      // Dettaglio
      const detail = await WorkEntry.find({ date: { $regex: `^${prefix}` } })
        .populate('userId', 'name')
        .populate('locationId', 'name')
        .sort({ 'userId.name': 1, date: 1 })
        .lean();

      // Riepilogo aggregato
      const summary = await WorkEntry.aggregate([
        { $match: { date: { $regex: `^${prefix}` } } },
        {
          $group: {
            _id: { userId: '$userId', locationId: '$locationId' },
            totalHours: { $sum: '$hours' },
            daysWorked: { $addToSet: '$date' },
          },
        },
        { $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' } },
        {
          $lookup: {
            from: 'locations',
            localField: '_id.locationId',
            foreignField: '_id',
            as: 'location',
          },
        },
        { $unwind: '$user' },
        { $unwind: '$location' },
        {
          $project: {
            _id: 0,
            userName: '$user.name',
            locationName: '$location.name',
            totalHours: 1,
            daysWorked: { $size: '$daysWorked' },
          },
        },
        { $sort: { userName: 1, locationName: 1 } },
      ]);

      const wb = XLSX.utils.book_new();

      // Foglio 1 — Riepilogo
      const userTotals: Record<string, number> = {};
      summary.forEach((r) => {
        userTotals[r.userName] = (userTotals[r.userName] ?? 0) + r.totalHours;
      });

      const summaryRows: (string | number)[][] = [
        [`Riepilogo Ore — ${monthLabel}`],
        [],
        ['Dipendente', 'Location', 'Ore Totali', 'Giorni Lavorati'],
        ...summary.map((r) => [r.userName, r.locationName, r.totalHours, r.daysWorked]),
        [],
        ['TOTALI PER DIPENDENTE', '', '', ''],
        ...Object.entries(userTotals).map(([name, tot]) => [name, '', tot, '']),
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Riepilogo');

      // Foglio 2 — Dettaglio giornaliero
      const detailRows: (string | number)[][] = [
        [`Dettaglio Giornaliero — ${monthLabel}`],
        [],
        ['Dipendente', 'Data', 'Location', 'Ore', 'Note'],
        ...detail.map((e) => [
          (e.userId as any).name,
          e.date,
          (e.locationId as any).name,
          e.hours,
          e.notes ?? '',
        ]),
      ];

      const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
      wsDetail['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Dettaglio Giornaliero');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      reply
        .header(
          'Content-Disposition',
          `attachment; filename="ore_${year}_${String(month).padStart(2, '0')}.xlsx"`
        )
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        .send(buf);
    }
  );
};

export default entriesRoutes;
