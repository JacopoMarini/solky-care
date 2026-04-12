import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import jwtPlugin from './plugins/jwt';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import locationsRoutes from './routes/locations';
import entriesRoutes from './routes/entries';
import notificationsRoutes from './routes/notifications';

const PORT = Number(process.env.PORT ?? 3001);

const fastify = Fastify({ logger: true });

async function bootstrap() {
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [];

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Permetti richieste senza origin (curl, server-to-server, Render health checks)
      if (!origin) return cb(null, true);
      // In dev (nessuna variabile) permetti tutto
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      fastify.log.warn(`CORS bloccato: origin="${origin}" non in [${allowedOrigins.join(', ')}]`);
      cb(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  await fastify.register(jwtPlugin);

  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(usersRoutes, { prefix: '/api/users' });
  fastify.register(locationsRoutes, { prefix: '/api/locations' });
  fastify.register(entriesRoutes, { prefix: '/api/entries' });
  fastify.register(notificationsRoutes, { prefix: '/api/notifications' });

  fastify.get('/api/health', async () => ({ ok: true }));

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
