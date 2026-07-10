import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '@/backend/auth/admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
    return NextResponse.json({ authenticated: Boolean(session) });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
