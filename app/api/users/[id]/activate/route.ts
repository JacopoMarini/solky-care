import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectDB, User } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { status: 'active' };
  if (body.role) updates.role = body.role;

  await connectDB();
  const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  if (!user)
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });

  return NextResponse.json({
    success: true,
    user: {
      id:     String((user as any)._id),
      name:   (user as any).name,
      email:  (user as any).email,
      role:   (user as any).role,
      status: (user as any).status,
    },
  });
}
