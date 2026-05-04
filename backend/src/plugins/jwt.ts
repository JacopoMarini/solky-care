import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { User, Profile } from '../lib/db';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate:  (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin:  (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: Profile;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const resolveUser = async (req: FastifyRequest, reply: FastifyReply): Promise<Profile | null> => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Token mancante' });
      return null;
    }

    const token = header.split(' ')[1];
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
    } catch {
      reply.status(401).send({ error: 'Token non valido o scaduto' });
      return null;
    }

    const user = await User.findById(payload.sub).lean();
    if (!user) {
      reply.status(401).send({ error: 'Utente non trovato' });
      return null;
    }

    return {
      id:         String((user as any)._id),
      email:      (user as any).email,
      name:       (user as any).name,
      role:       (user as any).role,
      status:     (user as any).status,
      created_at: (user as any).created_at?.toISOString?.() ?? '',
    };
  };

  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const profile = await resolveUser(req, reply);
    if (profile) req.user = profile;
  });

  fastify.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    const profile = await resolveUser(req, reply);
    if (!profile) return;
    if (profile.role !== 'admin') {
      reply.status(403).send({ error: 'Accesso riservato agli amministratori' });
      return;
    }
    req.user = profile;
  });
};

export default fp(authPlugin);
