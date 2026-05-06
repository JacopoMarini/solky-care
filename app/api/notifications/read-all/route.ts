import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectDB, Notification } from '@/lib/db';

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  await connectDB();
  await Notification.updateMany({ read: false }, { $set: { read: true } });
  return NextResponse.json({ success: true });
}
