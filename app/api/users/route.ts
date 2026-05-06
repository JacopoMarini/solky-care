import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth';
import { connectDB, User } from '@/lib/db';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  await connectDB();
  const users = await User.find().sort({ name: 1 }).lean();
  return NextResponse.json(
    users.map((u: any) => ({
      id: String(u._id), email: u.email, name: u.name, role: u.role, status: u.status, created_at: u.created_at,
    }))
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { name, email, password, role } = await req.json();
  if (!name || !email || !password)
    return NextResponse.json({ error: 'Tutti i campi sono obbligatori' }, { status: 400 });

  await connectDB();
  const existing = await User.findOne({ email }).lean();
  if (existing)
    return NextResponse.json({ error: 'Email già registrata' }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await new User({ email, name, passwordHash, role: role ?? 'user', status: 'active' }).save();
    return NextResponse.json({ id: String(user._id), name, email, role: role ?? 'user', status: 'active' });
  } catch (err: any) {
    if (err.code === 11000)
      return NextResponse.json({ error: 'Email già registrata' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
