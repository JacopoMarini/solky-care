import { FastifyPluginAsync } from 'fastify';
import { User } from '../models/User';

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const adminOpts = { preHandler: fastify.requireAdmin };

  // GET /api/users
  fastify.get('/', adminOpts, async () => {
    return User.find().select('-password').sort({ name: 1 }).lean();
  });

  // POST /api/users
  fastify.post<{
    Body: { name: string; email: string; password: string; role?: 'admin' | 'user' };
  }>('/', adminOpts, async (req, reply) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return reply.status(400).send({ error: 'Tutti i campi sono obbligatori' });

    const exists = await User.findOne({ email });
    if (exists) return reply.status(409).send({ error: 'Email già registrata' });

    // Gli utenti creati dall'admin sono subito attivi
    const user = await User.create({ name, email, password, role: role ?? 'user', status: 'active' });
    return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
  });

  // PUT /api/users/:id
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; email?: string; role?: 'admin' | 'user'; password?: string; status?: 'pending' | 'active' };
  }>('/:id', adminOpts, async (req, reply) => {
    const user = await User.findById(req.params.id);
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.role) user.role = req.body.role;
    if (req.body.status) user.status = req.body.status;
    if (req.body.password) user.password = req.body.password;

    await user.save();
    return { success: true };
  });

  // PATCH /api/users/:id/activate — abilita un utente pending
  fastify.patch<{
    Params: { id: string };
    Body: { role?: 'admin' | 'user' };
  }>('/:id/activate', adminOpts, async (req, reply) => {
    const user = await User.findById(req.params.id);
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

    user.status = 'active';
    if (req.body.role) user.role = req.body.role;
    await user.save();

    return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } };
  });

  // DELETE /api/users/:id
  fastify.delete<{
    Params: { id: string };
  }>('/:id', adminOpts, async (req, reply) => {
    if (req.params.id === req.user.id)
      return reply.status(400).send({ error: 'Non puoi eliminare te stesso' });
    await User.findByIdAndDelete(req.params.id);
    return { success: true };
  });
};

export default usersRoutes;
