import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, revokeAdminSession } from '@/backend/auth/admin';

export async function POST(request: NextRequest) {
  try {
    await revokeAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  } catch {
    // The local cookie must still be removed if the database is temporarily unavailable.
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
