import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireAdmin } from '@/lib/auth';
import { connectDB, WorkEntry } from '@/lib/db';

type PopulatedUser     = { _id: mongoose.Types.ObjectId; name: string; email: string };
type PopulatedLocation = { _id: mongoose.Types.ObjectId; name: string };

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const year  = req.nextUrl.searchParams.get('year');
  const month = req.nextUrl.searchParams.get('month');
  if (!year || !month)
    return NextResponse.json({ error: 'Anno e mese obbligatori' }, { status: 400 });

  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  await connectDB();
  const entries = await WorkEntry
    .find({ date: { $regex: `^${prefix}` } })
    .populate('user_id', 'name email')
    .populate('location_id', 'name')
    .sort({ date: 1 })
    .lean();

  return NextResponse.json(
    (entries as any[]).map((e) => ({
      userName:     (e.user_id as PopulatedUser)?.name ?? '',
      userEmail:    (e.user_id as PopulatedUser)?.email ?? '',
      date:         e.date,
      locationName: (e.location_id as PopulatedLocation)?.name ?? '',
      hours:        e.hours,
      notes:        e.notes ?? '',
    }))
  );
}
