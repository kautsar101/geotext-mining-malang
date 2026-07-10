import { getSupabaseAdmin } from '@/backend/db/supabase';

export type DatabaseApiKeyRow = {
  id: string;
  api_key: string;
  failure_count: number | null;
  cooldown_until: string | null;
};

export type ApiKeyFailureKind = 'rate_limit' | 'invalid_api_key' | 'server_error';

export async function getAvailableProviderKeys(provider: 'groq' | 'deepseek'): Promise<DatabaseApiKeyRow[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const now = Date.now();

  const { data, error } = await supabaseAdmin
    .from('llm_api_keys')
    .select('id, api_key, failure_count, cooldown_until')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(25);

  if (error) throw new Error(`Gagal membaca ${provider} API key pool: ${error.message}`);

  return ((data || []) as DatabaseApiKeyRow[]).filter((row) => {
    if (!row.api_key) return false;
    if (!row.cooldown_until) return true;
    return new Date(row.cooldown_until).getTime() <= now;
  });
}

export async function markProviderKeySuccess(keyId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from('llm_api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      failure_count: 0,
      last_error: null,
      last_error_at: null,
      cooldown_until: null,
    })
    .eq('id', keyId);
}

export async function markProviderKeyFailure(
  key: DatabaseApiKeyRow,
  kind: ApiKeyFailureKind,
  detail: string,
) {
  const supabaseAdmin = getSupabaseAdmin();
  const failureCount = (key.failure_count || 0) + 1;
  const now = new Date();
  const update: Record<string, unknown> = {
    failure_count: failureCount,
    last_error: `${kind}: ${detail}`.slice(0, 500),
    last_error_at: now.toISOString(),
  };

  if (kind === 'invalid_api_key') {
    update.is_active = false;
    update.cooldown_until = null;
  } else {
    const cooldownMinutes = kind === 'rate_limit' ? 10 : 2;
    update.cooldown_until = new Date(now.getTime() + cooldownMinutes * 60_000).toISOString();
  }

  await supabaseAdmin.from('llm_api_keys').update(update).eq('id', key.id);
}

export function classifyProviderFailure(status: number, body: string): ApiKeyFailureKind | null {
  const text = body.toLowerCase();

  if (status === 401 || status === 403 || /invalid|unauthorized|forbidden|api key/.test(text)) {
    return 'invalid_api_key';
  }

  if (status === 429 || /rate limit|quota|too many requests|limit exceeded/.test(text)) {
    return 'rate_limit';
  }

  if (status >= 500) return 'server_error';

  return null;
}
