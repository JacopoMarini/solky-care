import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../lib/supabase';

const locationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/locations — tutti gli utenti autenticati
  fastify.get('/', { preHandler: fastify.authenticate }, async () => {
    const { data } = await supabase.from('locations').select('*').order('name');
    return data ?? [];
  });

  // POST /api/locations — solo admin
  fastify.post<{ Body: { name: string } }>(
    '/',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { name } = req.body;
      if (!name) return reply.status(400).send({ error: 'Nome obbligatorio' });

      const { data, error } = await supabase
        .from('locations')
        .insert({ name })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return reply.status(409).send({ error: 'Location già esistente' });
        return reply.status(500).send({ error: error.message });
      }

      return { id: data.id, name: data.name };
    }
  );

  // DELETE /api/locations/:id — solo admin
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { error } = await supabase.from('locations').delete().eq('id', req.params.id);
      if (error) return reply.status(500).send({ error: error.message });
      return { success: true };
    }
  );
};

export default locationsRoutes;
