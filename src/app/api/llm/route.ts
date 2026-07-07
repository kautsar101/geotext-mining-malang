import { NextRequest, NextResponse } from 'next/server';
import { genSessionId, handleLLMRequest } from '@/backend/llm/service';

export async function POST(request: NextRequest) {
  const fallbackSessionId = request.headers.get('x-session-id') || genSessionId();

  try {
    const result = await handleLLMRequest(await request.json(), fallbackSessionId);
    return NextResponse.json(result.body, { status: result.status || 200 });
  } catch {
    return NextResponse.json({ error: 'Body JSON tidak valid' }, { status: 400 });
  }
}
