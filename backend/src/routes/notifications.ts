import { FastifyPluginAsync } from 'fastify';
import { Notification, User } from '../lib/db';

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  const adminOpts = { preHandler: fastify.requireAdmin };

  const serializeNotif = (n: any) => ({
    id:                String(n._id),
    type:              n.type,
    read:              n.read,
    trigger_user_id:   String(n.trigger_user_id),
    trigger_user_name: n.trigger_user_name,
    meta:              n.meta,
    created_at:        n.created_at,
  });

  // GET /api/notifications/unread-count
  fastify.get('/unread-count', adminOpts, async () => {
    const count = await Notification.countDocuments({ read: false });
    return { count };
  });

  // PATCH /api/notifications/read-all
  fastify.patch('/read-all', adminOpts, async () => {
    await Notification.updateMany({ read: false }, { $set: { read: true } });
    return { success: true };
  });

  // GET /api/notifications
  fastify.get<{ Querystring: { unreadOnly?: string } }>('/', adminOpts, async (req) => {
    const filter: Record<string, unknown> = {};
    if (req.query.unreadOnly === 'true') filter.read = false;

    const items      = await Notification.find(filter).sort({ created_at: -1 }).limit(50).lean();
    const unreadCount = await Notification.countDocuments({ read: false });

    return { items: items.map(serializeNotif), unreadCount };
  });

  // PATCH /api/notifications/:id/read
  fastify.patch<{ Params: { id: string } }>('/:id/read', adminOpts, async (req, reply) => {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id, { $set: { read: true } }, { new: true }
    ).lean();
    if (!notif) return reply.status(404).send({ error: 'Notifica non trovata' });
    return { success: true };
  });

  // POST /api/notifications/activate/:userId
  fastify.post<{
    Params: { userId: string };
    Body: { role?: 'admin' | 'user'; notificationId?: string };
  }>('/activate/:userId', adminOpts, async (req, reply) => {
    const { userId } = req.params;
    const updates: Record<string, unknown> = { status: 'active' };
    if (req.body.role) updates.role = req.body.role;

    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).lean();
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

    if (req.body.notificationId) {
      await Notification.findByIdAndUpdate(req.body.notificationId, { $set: { read: true } });
    }

    return {
      success: true,
      user: { id: String((user as any)._id), name: (user as any).name, role: (user as any).role, status: (user as any).status },
    };
  });
};

export default notificationsRoutes;
