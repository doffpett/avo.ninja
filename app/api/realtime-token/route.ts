export const runtime = 'edge';

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

  const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice: 'verse',
      modalities: ['audio', 'text'],
      instructions: 'You are a concise Norwegian voice assistant.',
    }),
  });

  if (!r.ok) {
    return new Response(await r.text(), { status: r.status });
  }
  const json = await r.json();
  return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });
}
