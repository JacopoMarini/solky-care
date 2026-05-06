import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectDB, Location } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  await connectDB();
  const loc = await Location.findByIdAndDelete(id);
  if (!loc)
    return NextResponse.json({ error: 'Location non trovata' }, { status: 404 });
  return NextResponse.json({ success: true });
}
