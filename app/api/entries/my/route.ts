import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { authenticate } from '@/lib/auth';
import { connectDB, WorkEntry } from '@/lib/db';

type PopulatedLocation = { _id: mongoose.Types.ObjectId; name: string };

export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (user instanceof NextResponse) return user;

  const date = req.nextUrl.searchParams.get('date');
  if (!date)
    return NextResponse.json({ error: 'Data obbligatoria' }, { status: 400 });

  await connectDB();
  const entries = await WorkEntry
    .find({ user_id: user.id, date })
    .populate('location_id', 'name')
    .lean();

  return NextResponse.json(
    entries.map((e: any) => ({
      id:           String(e._id),
      date:         e.date,
      hours:        e.hours,
      start_time:   e.start_time,
      end_time:     e.end_time,
      notes:        e.notes,
      locationId:   String(e.location_id?._id ?? e.location_id),
      locationName: (e.location_id as PopulatedLocation)?.name,
    }))
  );
}
