import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectDB, User } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password)
    return NextResponse.json({ error: 'Email e password obbligatorie' }, { status: 400 });

  await connectDB();
  const user = await User.findOne({ email }).lean();
  if (!user)
    return NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 });

  const valid = await bcrypt.compare(password, (user as any).passwordHash);
  if (!valid)
    return NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 });

  if ((user as any).status === 'pending')
    return NextResponse.json(
      { error: "Account in attesa di attivazione da parte dell'amministratore." },
      { status: 403 }
    );

  const userId = String((user as any)._id);
  const token  = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  return NextResponse.json({
    token,
    user: {
      id:     userId,
      name:   (user as any).name,
      email:  (user as any).email,
      role:   (user as any).role,
      status: (user as any).status,
    },
  });
}
