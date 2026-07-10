import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  clearFailedLogins,
  createAdminSession,
  getLoginCooldown,
  getRequestIp,
  recordFailedLogin,
  verifyAdminCredentials,
} from '@/backend/auth/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password || username.length > 64 || password.length > 256) {
      return NextResponse.json({ error: 'Username atau password tidak valid.' }, { status: 400 });
    }

    const ip = getRequestIp(request);
    const cooldown = await getLoginCooldown(username, ip);
    if (cooldown) {
      return NextResponse.json({ error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' }, { status: 429 });
    }

    const adminId = await verifyAdminCredentials(username, password);
    if (!adminId) {
      await recordFailedLogin(username, ip);
      return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 });
    }

    await clearFailedLogins(username, ip);
    const session = await createAdminSession(adminId);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE,
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Login admin belum siap. Pastikan SQL migration sudah dijalankan.' }, { status: 500 });
  }
}
