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
    .lean();

  const map = new Map<string, {
    userId: string; userName: string; userEmail: string;
    locationName: string; totalHours: number; days: Set<string>;
  }>();

  for (const e of entries as any[]) {
    const uid = String(e.user_id?._id ?? e.user_id);
    const lid = String(e.location_id?._id ?? e.location_id);
    const key = `${uid}__${lid}`;
    if (!map.has(key)) {
      map.set(key, {
        userId:       uid,
        userName:     (e.user_id as PopulatedUser)?.name ?? '',
        userEmail:    (e.user_id as PopulatedUser)?.email ?? '',
        locationName: (e.location_id as PopulatedLocation)?.name ?? '',
        totalHours:   0,
        days:         new Set(),
      });
    }
    const row = map.get(key)!;
    row.totalHours += e.hours;
    row.days.add(e.date);
  }

  return NextResponse.json(
    Array.from(map.values())
      .map((r) => ({ ...r, daysWorked: r.days.size, days: undefined }))
      .sort((a, b) => a.userName.localeCompare(b.userName) || a.locationName.localeCompare(b.locationName))
  );
}
