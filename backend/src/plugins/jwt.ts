import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { supabase, Profile } from '../lib/supabase';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: Profile;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const resolveUser = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<Profile | null> => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Token mancante' });
      return null;
    }

    const token = header.split(' ')[1];

    // Verifica il token con Supabase Auth (unica fonte di verità)
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      reply.status(401).send({ error: 'Token non valido o scaduto' });
      return null;
    }

    // Recupera profilo (ruolo, stato)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      reply.status(401).send({ error: 'Profilo non trovato' });
      return null;
    }

    return profile as Profile;
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
