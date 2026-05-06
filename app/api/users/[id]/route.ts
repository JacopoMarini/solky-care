import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth';
import { connectDB, User, WorkEntry, Notification } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const { name, email, role, password, status } = await req.json();

  const updates: Record<string, unknown> = {};
  if (name)   updates.name   = name;
  if (email)  updates.email  = email;
  if (role)   updates.role   = role;
  if (status) updates.status = status;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  await connectDB();
  const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  if (!user)
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (id === admin.id)
    return NextResponse.json({ error: 'Non puoi eliminare te stesso' }, { status: 400 });

  await connectDB();
  const user = await User.findByIdAndDelete(id);
  if (!user)
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });

  await WorkEntry.deleteMany({ user_id: id });
  await Notification.deleteMany({ trigger_user_id: id });

  return NextResponse.json({ success: true });
}
