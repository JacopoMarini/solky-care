import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../lib/supabase';

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/notifications/unread-count — solo il contatore (per polling leggero)
  // DEVE essere registrata prima di /:id/read per evitare conflitti di parametri
  fastify.get(
    '/unread-count',
    { preHandler: fastify.requireAdmin },
    async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('read', false);
      return { count: count ?? 0 };
    }
  );

  // PATCH /api/notifications/read-all — segna tutte come lette
  fastify.patch(
    '/read-all',
    { preHandler: fastify.requireAdmin },
    async () => {
      await supabase.from('notifications').update({ read: true }).eq('read', false);
      return { success: true };
    }
  );

  // GET /api/notifications — lista notifiche (solo admin)
  fastify.get<{ Querystring: { unreadOnly?: string } }>(
    '/',
    { preHandler: fastify.requireAdmin },
    async (req) => {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (req.query.unreadOnly === 'true') query = query.eq('read', false);

      const { data } = await query;

      const { count: unreadCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('read', false);

      return { items: data ?? [], unreadCount: unreadCount ?? 0 };
    }
  );

  // PATCH /api/notifications/:id/read — segna come letta
  fastify.patch<{ Params: { id: string } }>(
    '/:id/read',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Notifica non trovata' });
      return { success: true };
    }
  );

  // POST /api/notifications/activate/:userId — abilita utente + segna notifica letta
  fastify.post<{
    Params: { userId: string };
    Body: { role?: 'admin' | 'user'; notificationId?: string };
  }>(
    '/activate/:userId',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { userId } = req.params;
      const updates: Record<string, unknown> = { status: 'active' };
      if (req.body.role) updates.role = req.body.role;

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Utente non trovato' });

      if (req.body.notificationId) {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', req.body.notificationId);
      }

      return {
        success: true,
        user: { id: data.id, name: data.name, role: data.role, status: data.status },
      };
    }
  );
};

export default notificationsRoutes;
