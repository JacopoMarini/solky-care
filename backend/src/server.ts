import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import mongoose from 'mongoose';

import jwtPlugin from './plugins/jwt';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import locationsRoutes from './routes/locations';
import entriesRoutes from './routes/entries';
import notificationsRoutes from './routes/notifications';
import { Location } from './models/Location';
import { User } from './models/User';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/solky-care';
const PORT = Number(process.env.PORT ?? 3001);

const fastify = Fastify({ logger: true });

async function bootstrap() {
  // Plugins
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : true; // in dev accetta tutto
  await fastify.register(cors, { origin: allowedOrigins });
  await fastify.register(jwtPlugin);

  // Routes
  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(usersRoutes, { prefix: '/api/users' });
  fastify.register(locationsRoutes, { prefix: '/api/locations' });
  fastify.register(entriesRoutes, { prefix: '/api/entries' });
  fastify.register(notificationsRoutes, { prefix: '/api/notifications' });

  fastify.get('/api/health', async () => ({ ok: true }));

  // MongoDB
  await mongoose.connect(MONGO_URI);
  fastify.log.info(`MongoDB connesso: ${MONGO_URI}`);

  // Migration: utenti senza campo status → active
  const migrated = await User.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'active' } }
  );
  if (migrated.modifiedCount > 0) {
    fastify.log.info(`Migration: ${migrated.modifiedCount} utenti impostati come active`);
  }

  // Seed location di default se non esistono
  const count = await Location.countDocuments();
  if (count === 0) {
    await Location.insertMany([
      { name: 'BnB' },
      { name: 'Casa Vacanze' },
      { name: 'Ufficio' },
      { name: 'Smart Working' },
    ]);
    fastify.log.info('Location di default create');
  }

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
