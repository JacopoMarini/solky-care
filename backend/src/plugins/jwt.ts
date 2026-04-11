import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'solky-secret-change-in-production',
    sign: { expiresIn: '7d' },
  });

  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Token non valido o mancante' });
    }
  });

  fastify.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Token non valido o mancante' });
    }
    if (req.user.role !== 'admin') {
      reply.status(403).send({ error: 'Accesso riservato agli amministratori' });
    }
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(jwtPlugin);
