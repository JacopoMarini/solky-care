import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { authenticate } from '@/lib/auth';
import { connectDB, WorkEntry } from '@/lib/db';

type PopulatedLocation = { _id: mongoose.Types.ObjectId; name: string };

export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (user instanceof NextResponse) return user;

  const year  = req.nextUrl.searchParams.get('year');
  const month = req.nextUrl.searchParams.get('month');
  if (!year || !month)
    return NextResponse.json({ error: 'Anno e mese obbligatori' }, { status: 400 });

  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  await connectDB();
  const entries = await WorkEntry
    .find({ user_id: user.id, date: { $regex: `^${prefix}` } })
    .populate('location_id', 'name')
    .sort({ date: 1 })
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
