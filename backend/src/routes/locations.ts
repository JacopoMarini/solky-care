import { FastifyPluginAsync } from 'fastify';
import { Location } from '../lib/db';

const locationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/locations
  fastify.get('/', { preHandler: fastify.authenticate }, async () => {
    const locs = await Location.find().sort({ name: 1 }).lean();
    return locs.map((l: any) => ({ id: String(l._id), name: l.name, created_at: l.created_at }));
  });

  // POST /api/locations
  fastify.post<{ Body: { name: string } }>(
    '/',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { name } = req.body;
      if (!name) return reply.status(400).send({ error: 'Nome obbligatorio' });

      try {
        const loc = await new Location({ name }).save();
        return { id: String(loc._id), name: loc.name };
      } catch (err: any) {
        if (err.code === 11000) return reply.status(409).send({ error: 'Location già esistente' });
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // DELETE /api/locations/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const loc = await Location.findByIdAndDelete(req.params.id);
      if (!loc) return reply.status(404).send({ error: 'Location non trovata' });
      return { success: true };
    }
  );
};

export default locationsRoutes;
