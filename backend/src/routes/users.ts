import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../lib/supabase';

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const adminOpts = { preHandler: fastify.requireAdmin };

  // GET /api/users
  fastify.get('/', adminOpts, async () => {
    const { data } = await supabase.from('profiles').select('*').order('name');
    return data ?? [];
  });

  // POST /api/users — crea utente (admin, subito attivo)
  fastify.post<{
    Body: { name: string; email: string; password: string; role?: 'admin' | 'user' };
  }>('/', adminOpts, async (req, reply) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return reply.status(400).send({ error: 'Tutti i campi sono obbligatori' });

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) return reply.status(409).send({ error: 'Email già registrata' });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData.user)
      return reply.status(500).send({ error: authError?.message ?? 'Errore creazione utente' });

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email,
      name,
      role: role ?? 'user',
      status: 'active',
    });
    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return reply.status(500).send({ error: 'Errore creazione profilo' });
    }

    return { id: authData.user.id, name, email, role: role ?? 'user', status: 'active' };
  });

  // PUT /api/users/:id
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; email?: string; role?: 'admin' | 'user'; password?: string; status?: 'pending' | 'active' };
  }>('/:id', adminOpts, async (req, reply) => {
    const { id } = req.params;
    const { name, email, role, password, status } = req.body;

    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (role) updates.role = role;
    if (status) updates.status = status;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('profiles').update(updates).eq('id', id);
      if (error) return reply.status(500).send({ error: error.message });
    }

    if (password) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password });
      if (error) return reply.status(500).send({ error: error.message });
    }

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

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return reply.status(404).send({ error: 'Utente non trovato' });

    return { success: true, user: { id: data.id, name: data.name, email: data.email, role: data.role, status: data.status } };
  });

  // DELETE /api/users/:id
  fastify.delete<{
    Params: { id: string };
  }>('/:id', adminOpts, async (req, reply) => {
    if (req.params.id === req.user.id)
      return reply.status(400).send({ error: 'Non puoi eliminare te stesso' });

    // deleteUser in Auth cascada su profiles grazie al FK on delete cascade
    const { error } = await supabase.auth.admin.deleteUser(req.params.id);
    if (error) return reply.status(500).send({ error: error.message });

    return { success: true };
  });
};

export default usersRoutes;
