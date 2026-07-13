import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '@/backend/auth/admin';
import { genSessionId, handleLLMRequest } from '@/backend/llm/service';
import type { LLMProcessStep } from '@/backend/llm/types';

export const runtime = 'nodejs';

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const fallbackSessionId = request.headers.get('x-session-id') || genSessionId();

  try {
    const body = await request.json();
    const adminSession = await getAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
    const mode = adminSession ? 'admin' : 'guest';

    if (body?.stream === true) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(encodeSSE(event, data)));
          };

          try {
            const result = await handleLLMRequest(body, fallbackSessionId, {
              mode,
              onStep: (step: LLMProcessStep) => send('step', step),
            });
            send('result', result.body);
          } catch {
            send('error', { error: 'Gagal memproses permintaan LLM' });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const result = await handleLLMRequest(body, fallbackSessionId, { mode });
    return NextResponse.json(result.body, { status: result.status || 200 });
  } catch {
    return NextResponse.json({ error: 'Body JSON tidak valid' }, { status: 400 });
  }
}
