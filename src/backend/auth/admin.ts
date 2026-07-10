import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/backend/db/supabase';

export const ADMIN_SESSION_COOKIE = 'llm_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MAX_FAILURES = 5;
const COOLDOWN_MINUTES = 15;

type AdminSessionRow = {
  id: string;
  admin_id: string;
  expires_at: string;
  revoked_at: string | null;
};

type LoginAttemptRow = {
  failed_count: number;
  cooldown_until: string | null;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function loginIdentity(username: string, ip: string) {
  return sha256(`${username.trim().toLowerCase()}|${ip}`);
}

export function getRequestIp(request: Request) {
  return request.headers.get('x-vercel-forwarded-for')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function getAdminSession(token: string | undefined) {
  if (!token) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('llm_admin_sessions')
    .select('id, admin_id, expires_at, revoked_at')
    .eq('token_hash', sha256(token))
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return data as AdminSessionRow;
}

export async function verifyAdminCredentials(username: string, password: string) {
  const { data, error } = await getSupabaseAdmin()
    .rpc('verify_llm_admin_credentials', { p_username: username, p_password: password });

  if (error) throw new Error(`Gagal memverifikasi admin: ${error.message}`);
  return Array.isArray(data) && data.length > 0 ? data[0]?.id || null : null;
}

export async function getLoginCooldown(username: string, ip: string) {
  const { data } = await getSupabaseAdmin()
    .from('llm_admin_login_attempts')
    .select('failed_count, cooldown_until')
    .eq('identity_hash', loginIdentity(username, ip))
    .maybeSingle();

  const attempt = data as LoginAttemptRow | null;
  if (!attempt?.cooldown_until) return null;
  const until = new Date(attempt.cooldown_until);
  return Number.isFinite(until.getTime()) && until.getTime() > Date.now() ? until : null;
}

export async function recordFailedLogin(username: string, ip: string) {
  const identityHash = loginIdentity(username, ip);
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('llm_admin_login_attempts')
    .select('failed_count')
    .eq('identity_hash', identityHash)
    .maybeSingle();

  const failedCount = Number((data as LoginAttemptRow | null)?.failed_count || 0) + 1;
  const now = new Date();
  const cooldownUntil = failedCount >= MAX_FAILURES
    ? new Date(now.getTime() + COOLDOWN_MINUTES * 60_000).toISOString()
    : null;

  await supabaseAdmin.from('llm_admin_login_attempts').upsert({
    identity_hash: identityHash,
    failed_count: failedCount,
    cooldown_until: cooldownUntil,
    last_failed_at: now.toISOString(),
  });
}

export async function clearFailedLogins(username: string, ip: string) {
  await getSupabaseAdmin()
    .from('llm_admin_login_attempts')
    .delete()
    .eq('identity_hash', loginIdentity(username, ip));
}

export async function createAdminSession(adminId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const { error } = await getSupabaseAdmin().from('llm_admin_sessions').insert({
    admin_id: adminId,
    token_hash: sha256(token),
    expires_at: expiresAt,
  });

  if (error) throw new Error(`Gagal membuat session admin: ${error.message}`);
  return { token, expiresAt };
}

export async function revokeAdminSession(token: string | undefined) {
  if (!token) return;
  await getSupabaseAdmin()
    .from('llm_admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', sha256(token));
}

export const ADMIN_SESSION_MAX_AGE = SESSION_TTL_SECONDS;
