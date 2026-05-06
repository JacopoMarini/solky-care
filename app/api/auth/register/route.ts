import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectDB, User, Notification } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password)
    return NextResponse.json({ error: 'Tutti i campi sono obbligatori' }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: 'La password deve avere almeno 6 caratteri' }, { status: 400 });

  await connectDB();
  const existing = await User.findOne({ email }).lean();
  if (existing)
    return NextResponse.json({ error: 'Email già registrata' }, { status: 409 });

  const isFirst = (await User.countDocuments()) === 0;
  const role    = isFirst ? 'admin' : 'user';
  const status  = isFirst ? 'active' : 'pending';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await new User({ email, name, passwordHash, role, status }).save();
  const userId = String(user._id);

  if (!isFirst) {
    await new Notification({
      type:              'new_registration',
      trigger_user_id:   user._id,
      trigger_user_name: name,
      meta:              { email },
    }).save();
    return NextResponse.json(
      { pending: true, message: 'Registrazione ricevuta. Un amministratore abiliterà il tuo account a breve.' },
      { status: 202 }
    );
  }

  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return NextResponse.json({ token, user: { id: userId, name, email, role, status } });
}
