import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth';
import { connectDB, WorkEntry } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticate(req);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const { hours, start_time, end_time, notes } = await req.json();

  await connectDB();
  const entry = await WorkEntry.findById(id).lean();
  if (!entry)
    return NextResponse.json({ error: 'Entry non trovata' }, { status: 404 });
  if (String((entry as any).user_id) !== user.id && user.role !== 'admin')
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (hours != null)            updates.hours      = hours;
  if (start_time !== undefined) updates.start_time = start_time || null;
  if (end_time !== undefined)   updates.end_time   = end_time || null;
  if (notes !== undefined)      updates.notes      = notes;

  await WorkEntry.findByIdAndUpdate(id, { $set: updates });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticate(req);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  await connectDB();
  const entry = await WorkEntry.findById(id).lean();
  if (!entry)
    return NextResponse.json({ error: 'Entry non trovata' }, { status: 404 });
  if (String((entry as any).user_id) !== user.id && user.role !== 'admin')
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });

  await WorkEntry.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
