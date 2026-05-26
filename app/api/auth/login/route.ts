import { NextRequest, NextResponse } from 'next/server';
import { signToken, cookieOptions } from '@/lib/auth';
import { qOne } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const user = await qOne('SELECT * FROM users WHERE email=$1 AND active=1', [email]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
    response.cookies.set(cookieOptions.name, token, cookieOptions);
    return response;
  } catch (e) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
