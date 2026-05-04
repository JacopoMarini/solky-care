import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { User, WorkEntry, Notification } from '../lib/db';

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const adminOpts = { preHandler: fastify.requireAdmin };

  // GET /api/users
  fastify.get('/', adminOpts, async () => {
    const users = await User.find().sort({ name: 1 }).lean();
    return users.map((u: any) => ({
      id: String(u._id), email: u.email, name: u.name, role: u.role, status: u.status, created_at: u.created_at,
    }));
  });

  // POST /api/users — crea utente (admin, subito attivo)
  fastify.post<{
    Body: { name: string; email: string; password: string; role?: 'admin' | 'user' };
  }>('/', adminOpts, async (req, reply) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return reply.status(400).send({ error: 'Tutti i campi sono obbligatori' });

    const existing = await User.findOne({ email }).lean();
    if (existing) return reply.status(409).send({ error: 'Email già registrata' });

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await new User({ email, name, passwordHash, role: role ?? 'user', status: 'active' }).save();
      return { id: String(user._id), name, email, role: role ?? 'user', status: 'active' };
    } catch (err: any) {
      if (err.code === 11000) return reply.status(409).send({ error: 'Email già registrata' });
      return reply.status(500).send({ error: err.message });
    }
  });

  // PUT /api/users/:id
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; email?: string; role?: 'admin' | 'user'; password?: string; status?: 'pending' | 'active' };
  }>('/:id', adminOpts, async (req, reply) => {
    const { id } = req.params;
    const { name, email, role, password, status } = req.body;

    const updates: Record<string, unknown> = {};
    if (name)   updates.name   = name;
    if (email)  updates.email  = email;
    if (role)   updates.role   = role;
    if (status) updates.status = status;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });
    return { success: true };
  });

  // PATCH /api/users/:id/activate
  fastify.patch<{
    Params: { id: string };
    Body: { role?: 'admin' | 'user' };
  }>('/:id/activate', adminOpts, async (req, reply) => {
    const { id } = req.params;
    const updates: Record<string, unknown> = { status: 'active' };
    if (req.body.role) updates.role = req.body.role;

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

    return {
      success: true,
      user: { id: String((user as any)._id), name: (user as any).name, email: (user as any).email, role: (user as any).role, status: (user as any).status },
    };
  });

  // DELETE /api/users/:id
  fastify.delete<{ Params: { id: string } }>('/:id', adminOpts, async (req, reply) => {
    if (req.params.id === req.user.id)
      return reply.status(400).send({ error: 'Non puoi eliminare te stesso' });

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

    // Cascade delete
    await WorkEntry.deleteMany({ user_id: req.params.id });
    await Notification.deleteMany({ trigger_user_id: req.params.id });

    return { success: true };
  });
};

export default usersRoutes;
