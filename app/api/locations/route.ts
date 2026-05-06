import { NextRequest, NextResponse } from 'next/server';
import { authenticate, requireAdmin } from '@/lib/auth';
import { connectDB, Location } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (user instanceof NextResponse) return user;

  await connectDB();
  const locs = await Location.find().sort({ name: 1 }).lean();
  return NextResponse.json(
    locs.map((l: any) => ({ id: String(l._id), name: l.name, created_at: l.created_at }))
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { name } = await req.json();
  if (!name)
    return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 });

  await connectDB();
  try {
    const loc = await new Location({ name }).save();
    return NextResponse.json({ id: String(loc._id), name: loc.name });
  } catch (err: any) {
    if (err.code === 11000)
      return NextResponse.json({ error: 'Location già esistente' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
