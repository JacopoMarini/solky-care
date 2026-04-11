import { FastifyPluginAsync } from 'fastify';
import { Notification } from '../models/Notification';
import { User } from '../models/User';

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/notifications — lista notifiche (solo admin)
  fastify.get<{ Querystring: { unreadOnly?: string } }>(
    '/',
    { preHandler: fastify.requireAdmin },
    async (req) => {
      const filter = req.query.unreadOnly === 'true' ? { read: false } : {};
      const items = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const unreadCount = await Notification.countDocuments({ read: false });
      return { items, unreadCount };
    }
  );

  // PATCH /api/notifications/:id/read — segna come letta
  fastify.patch<{ Params: { id: string } }>(
    '/:id/read',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const n = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
      if (!n) return reply.status(404).send({ error: 'Notifica non trovata' });
      return { success: true };
    }
  );

  // PATCH /api/notifications/read-all — segna tutte come lette
  fastify.patch(
    '/read-all',
    { preHandler: fastify.requireAdmin },
    async () => {
      await Notification.updateMany({ read: false }, { read: true });
      return { success: true };
    }
  );

  // GET /api/notifications/unread-count — solo il contatore (per polling leggero)
  fastify.get(
    '/unread-count',
    { preHandler: fastify.requireAdmin },
    async () => {
      const count = await Notification.countDocuments({ read: false });
      return { count };
    }
  );

  // POST /api/notifications/activate/:userId — abilita utente + segna notifica letta
  fastify.post<{ Params: { userId: string }; Body: { role?: 'admin' | 'user'; notificationId?: string } }>(
    '/activate/:userId',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const user = await User.findById(req.params.userId);
      if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

      user.status = 'active';
      if (req.body.role) user.role = req.body.role;
      await user.save();

      if (req.body.notificationId) {
        await Notification.findByIdAndUpdate(req.body.notificationId, { read: true });
      }

      return { success: true, user: { id: user.id, name: user.name, role: user.role, status: user.status } };
    }
  );
};

export default notificationsRoutes;
