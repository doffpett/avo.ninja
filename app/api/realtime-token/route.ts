export const runtime = 'edge';

async function createSession(overrides: any = {}) {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

  const payload: Record<string, any> = {
    model,
    voice: 'verse',
    modalities: ['audio', 'text'],
    instructions: 'You are a concise Norwegian voice assistant.',
    ...overrides,
  };

  const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    return new Response(await r.text(), { status: r.status });
  }
  const json = await r.json();
  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  try {
    const { tools, connections } = await req.json();
    const overrides: Record<string, any> = {};
    if (connections) overrides.connections = connections;
    if (Array.isArray(tools) && tools.length) overrides.tools = tools;
    return createSession(overrides);
  } catch {
    return createSession();
  }
}

export async function GET() {
  return createSession();
}
