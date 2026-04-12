import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../lib/supabase';

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

    // Controlla se esiste già un profilo con questa email
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) return reply.status(409).send({ error: 'Email già registrata' });

    // Determina se è il primo utente (diventa admin)
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    const isFirst = (count ?? 0) === 0;
    const role = isFirst ? 'admin' : 'user';
    const status = isFirst ? 'active' : 'pending';

    // Crea utente in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData.user)
      return reply.status(500).send({ error: authError?.message ?? 'Errore creazione utente' });

    // Crea profilo nella tabella profiles
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email,
      name,
      role,
      status,
    });
    if (profileError) {
      // Rollback: elimina l'utente da Auth se il profilo non è stato creato
      await supabase.auth.admin.deleteUser(authData.user.id);
      return reply.status(500).send({ error: 'Errore creazione profilo' });
    }

    // Notifica per utenti non-admin
    if (!isFirst) {
      await supabase.from('notifications').insert({
        type: 'new_registration',
        trigger_user_id: authData.user.id,
        trigger_user_name: name,
        meta: { email },
      });
      return reply.status(202).send({
        pending: true,
        message: 'Registrazione ricevuta. Un amministratore abiliterà il tuo account a breve.',
      });
    }

    // Primo utente: esegui login per ottenere il token
    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !session.session)
      return reply.status(500).send({ error: 'Errore login dopo registrazione' });

    return {
      token: session.session.access_token,
      user: { id: authData.user.id, name, email, role, status },
    };
  });

  // POST /api/auth/login
  fastify.post<{
    Body: { email: string; password: string };
  }>('/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password)
      return reply.status(400).send({ error: 'Email e password obbligatorie' });

    const { data: session, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !session.session)
      return reply.status(401).send({ error: 'Credenziali non valide' });

    // Recupera profilo
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!profile) return reply.status(401).send({ error: 'Profilo non trovato' });

    if (profile.status === 'pending')
      return reply.status(403).send({
        error: "Account in attesa di attivazione da parte dell'amministratore.",
      });

    return {
      token: session.session.access_token,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        status: profile.status,
      },
    };
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: fastify.authenticate }, async (req) => {
    return req.user;
  });
};

export default authRoutes;
