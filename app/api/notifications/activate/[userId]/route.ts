import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectDB, User, Notification } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { userId } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { status: 'active' };
  if (body.role) updates.role = body.role;

  await connectDB();
  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).lean();
  if (!user)
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });

  if (body.notificationId) {
    await Notification.findByIdAndUpdate(body.notificationId, { $set: { read: true } });
  }

  return NextResponse.json({
    success: true,
    user: {
      id:     String((user as any)._id),
      name:   (user as any).name,
      role:   (user as any).role,
      status: (user as any).status,
    },
  });
}
