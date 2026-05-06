import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectDB, Notification } from '@/lib/db';

const serialize = (n: any) => ({
  id:                String(n._id),
  type:              n.type,
  read:              n.read,
  trigger_user_id:   String(n.trigger_user_id),
  trigger_user_name: n.trigger_user_name,
  meta:              n.meta,
  created_at:        n.created_at,
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const unreadOnly = req.nextUrl.searchParams.get('unreadOnly') === 'true';
  const filter: Record<string, unknown> = {};
  if (unreadOnly) filter.read = false;

  await connectDB();
  const items       = await Notification.find(filter).sort({ created_at: -1 }).limit(50).lean();
  const unreadCount = await Notification.countDocuments({ read: false });

  return NextResponse.json({ items: items.map(serialize), unreadCount });
}
