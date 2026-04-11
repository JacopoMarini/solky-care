import { FastifyPluginAsync } from 'fastify';
import { Location } from '../models/Location';

const locationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/locations — tutti gli utenti autenticati
  fastify.get('/', { preHandler: fastify.authenticate }, async () => {
    return Location.find().sort({ name: 1 }).lean();
  });

  // POST /api/locations — solo admin
  fastify.post<{ Body: { name: string } }>(
    '/',
    { preHandler: fastify.requireAdmin },
    async (req, reply) => {
      const { name } = req.body;
      if (!name) return reply.status(400).send({ error: 'Nome obbligatorio' });

      const exists = await Location.findOne({ name });
      if (exists) return reply.status(409).send({ error: 'Location già esistente' });

      const loc = await Location.create({ name });
      return { id: loc.id, name: loc.name };
    }
  );

  // DELETE /api/locations/:id — solo admin
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: fastify.requireAdmin },
    async (req) => {
      await Location.findByIdAndDelete(req.params.id);
      return { success: true };
    }
  );
};

export default locationsRoutes;
