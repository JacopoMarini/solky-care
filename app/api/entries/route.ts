import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth';
import { connectDB, WorkEntry, Location, Notification } from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (user instanceof NextResponse) return user;

  const { locationId, date, hours, start_time, end_time, notes } = await req.json();
  if (!locationId || !date || hours == null)
    return NextResponse.json({ error: 'locationId, date e hours obbligatori' }, { status: 400 });
  if (hours <= 0 || hours > 24)
    return NextResponse.json({ error: 'Ore non valide (0-24)' }, { status: 400 });

  await connectDB();
  const entry = await new WorkEntry({
    user_id:     user.id,
    location_id: locationId,
    date,
    hours,
    start_time:  start_time ?? null,
    end_time:    end_time ?? null,
    notes:       notes ?? '',
  }).save();

  const loc = await Location.findById(locationId).lean();
  await new Notification({
    type:              'hours_added',
    trigger_user_id:   user.id,
    trigger_user_name: user.name,
    meta:              { date, hours, locationName: (loc as any)?.name ?? locationId },
  }).save();

  return NextResponse.json({ id: String(entry._id) });
}
