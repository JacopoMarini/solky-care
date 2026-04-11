import { FastifyPluginAsync } from 'fastify';
import { User } from '../models/User';
import { Notification } from '../models/Notification';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post<{
    Body: { name: string; email: string; password: string };
  }>('/register', async (req, reply) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return reply.status(400).send({ error: 'Tutti i campi sono obbligatori' });
    if (password.length < 6)
      return reply.status(400).send({ error: 'La password deve avere almeno 6 caratteri' });

    const exists = await User.findOne({ email });
    if (exists) return reply.status(409).send({ error: 'Email già registrata' });

    const count = await User.countDocuments();
    const isFirst = count === 0;
    const role = isFirst ? 'admin' : 'user';
    // Il primo utente (admin) è subito attivo, gli altri sono pending
    const status = isFirst ? 'active' : 'pending';

    const user = await User.create({ name, email, password, role, status });

    // Notifica all'admin solo per utenti non-admin
    if (!isFirst) {
      await Notification.create({
        type: 'new_registration',
        triggerUserId: user._id,
        triggerUserName: user.name,
        meta: { email: user.email },
      });
    }

    // Gli utenti pending non ricevono token: devono aspettare l'attivazione
    if (status === 'pending') {
      return reply.status(202).send({ pending: true, message: 'Registrazione ricevuta. Un amministratore abiliterà il tuo account a breve.' });
    }

    const token = fastify.jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } };
  });

  // POST /api/auth/login
  fastify.post<{
    Body: { email: string; password: string };
  }>('/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password)
      return reply.status(400).send({ error: 'Email e password obbligatorie' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return reply.status(401).send({ error: 'Credenziali non valide' });

    // Utenti senza campo status (pre-migrazione) sono considerati attivi
    if (user.status === 'pending')
      return reply.status(403).send({ error: "Account in attesa di attivazione da parte dell'amministratore." });

    const token = fastify.jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } };
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: fastify.authenticate }, async (req) => {
    return req.user;
  });
};

export default authRoutes;
