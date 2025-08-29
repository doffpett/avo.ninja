export const runtime = 'edge';

function mcpToolFromEnv() {
  const url = process.env.ZAPIER_MCP_SERVER_URL || process.env.MCP_SERVER_URL;
  if (!url) return null;
  const label = process.env.ZAPIER_MCP_LABEL || process.env.MCP_SERVER_LABEL || 'zapier';
  const requireApproval = process.env.ZAPIER_MCP_REQUIRE_APPROVAL || process.env.MCP_REQUIRE_APPROVAL || 'never';
  const token = process.env.ZAPIER_MCP_TOKEN || process.env.MCP_SERVER_TOKEN;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const tool: Record<string, any> = {
    type: 'mcp',
    server_label: label,
    server_url: url,
    require_approval: requireApproval,
  };
  if (Object.keys(headers).length) tool.headers = headers;
  return tool;
}

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
  let body: any = {};
  try { body = await req.json(); } catch {}
  const { useTools, tools, connections } = body || {};
  const overrides: Record<string, any> = {};
  if (connections) overrides.connections = connections;

  const outTools: any[] = Array.isArray(tools) ? [...tools] : [];
  if (useTools) {
    const tool = mcpToolFromEnv();
    if (tool) outTools.push(tool);
  }
  if (outTools.length) overrides.tools = outTools;

  return createSession(overrides);
}

export async function GET() {
  return createSession();
}
