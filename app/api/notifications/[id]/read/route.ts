import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectDB, Notification } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  await connectDB();
  const notif = await Notification.findByIdAndUpdate(id, { $set: { read: true } }, { new: true }).lean();
  if (!notif)
    return NextResponse.json({ error: 'Notifica non trovata' }, { status: 404 });
  return NextResponse.json({ success: true });
}
