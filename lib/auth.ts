import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { connectDB, User, Profile } from './db';

async function resolveProfile(req: NextRequest): Promise<Profile | NextResponse> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Token mancante' }, { status: 401 });
  }

  const token = header.split(' ')[1];
  let payload: { sub: string };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
  } catch {
    return NextResponse.json({ error: 'Token non valido o scaduto' }, { status: 401 });
  }

  await connectDB();
  const user = await User.findById(payload.sub).lean();
  if (!user) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 401 });
  }

  return {
    id:         String((user as any)._id),
    email:      (user as any).email,
    name:       (user as any).name,
    role:       (user as any).role,
    status:     (user as any).status,
    created_at: (user as any).created_at?.toISOString?.() ?? '',
  };
}

export async function authenticate(req: NextRequest): Promise<Profile | NextResponse> {
  return resolveProfile(req);
}

export async function requireAdmin(req: NextRequest): Promise<Profile | NextResponse> {
  const result = await resolveProfile(req);
  if (result instanceof NextResponse) return result;
  if (result.role !== 'admin') {
    return NextResponse.json({ error: 'Accesso riservato agli amministratori' }, { status: 403 });
  }
  return result;
}
