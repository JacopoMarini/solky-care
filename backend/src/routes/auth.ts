import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../lib/db';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post<{ Body: { name: string; email: string; password: string } }>(
    '/register',
    async (req, reply) => {
      const { name, email, password } = req.body;
      if (!name || !email || !password)
        return reply.status(400).send({ error: 'Tutti i campi sono obbligatori' });
      if (password.length < 6)
        return reply.status(400).send({ error: 'La password deve avere almeno 6 caratteri' });

      const existing = await User.findOne({ email }).lean();
      if (existing) return reply.status(409).send({ error: 'Email già registrata' });

      const isFirst = (await User.countDocuments()) === 0;
      const role   = isFirst ? 'admin' : 'user';
      const status = isFirst ? 'active' : 'pending';

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await new User({ email, name, passwordHash, role, status }).save();
      const userId = String(user._id);

      if (!isFirst) {
        await new (await import('../lib/db')).Notification({
          type:              'new_registration',
          trigger_user_id:   user._id,
          trigger_user_name: name,
          meta:              { email },
        }).save();
        return reply.status(202).send({
          pending: true,
          message: 'Registrazione ricevuta. Un amministratore abiliterà il tuo account a breve.',
        });
      }

      const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });
      return { token, user: { id: userId, name, email, role, status } };
    }
  );

  // POST /api/auth/login
  fastify.post<{ Body: { email: string; password: string } }>(
    '/login',
    async (req, reply) => {
      const { email, password } = req.body;
      if (!email || !password)
        return reply.status(400).send({ error: 'Email e password obbligatorie' });

      const user = await User.findOne({ email }).lean();
      if (!user) return reply.status(401).send({ error: 'Credenziali non valide' });

      const valid = await bcrypt.compare(password, (user as any).passwordHash);
      if (!valid) return reply.status(401).send({ error: 'Credenziali non valide' });

      if ((user as any).status === 'pending')
        return reply.status(403).send({ error: "Account in attesa di attivazione da parte dell'amministratore." });

      const userId = String((user as any)._id);
      const token  = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });

      return {
        token,
        user: {
          id:     userId,
          name:   (user as any).name,
          email:  (user as any).email,
          role:   (user as any).role,
          status: (user as any).status,
        },
      };
    }
  );

  // GET /api/auth/me
  fastify.get('/me', { preHandler: fastify.authenticate }, async (req) => req.user);
};

export default authRoutes;
