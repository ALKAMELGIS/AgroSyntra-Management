import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import * as settingsSvc from '../systemSettings.service';

/**
 * One tool-calling interface over the provider chosen in Settings → AI Brain
 * (Anthropic Claude or OpenAI). The agent only ever sees these neutral shapes.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any };

export type Turn =
  | { role: 'user'; content: string | Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> }
  | { role: 'assistant'; content: Block[] };

export interface ModelReply {
  content: Block[];
  stop: 'end' | 'tool_use' | 'max_tokens';
  usage: { input: number; output: number };
}

export type CallModel = (args: { system: string; turns: Turn[]; tools: ToolDef[]; maxTokens?: number }) => Promise<ModelReply>;

async function config() {
  const provider = (await settingsSvc.get('ai_provider')) || 'anthropic';
  const model = (await settingsSvc.get('ai_model')) || 'claude-sonnet-4-20250514';
  const apiKey = (await settingsSvc.getAIKey()) || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    throw new AppError('The AI assistant is not set up yet: add the API key in Settings → API Keys → AI Brain.', 'AI_NOT_CONFIGURED', 503);
  }
  return { provider, model, apiKey };
}

async function callAnthropic(model: string, apiKey: string, args: Parameters<CallModel>[0]): Promise<ModelReply> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: args.maxTokens ?? 2048,
      system: args.system,
      tools: args.tools,
      messages: args.turns,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body: body.slice(0, 500) }, 'Claude API error');
    throw new AppError(`The AI service returned an error (${res.status}).`, 'AI_PROVIDER_ERROR', 502);
  }
  const data = await res.json() as any;
  const content: Block[] = (data.content || [])
    .filter((b: any) => b.type === 'text' || b.type === 'tool_use')
    .map((b: any) => (b.type === 'text' ? { type: 'text', text: b.text } : { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} }));
  return {
    content,
    stop: data.stop_reason === 'tool_use' ? 'tool_use' : data.stop_reason === 'max_tokens' ? 'max_tokens' : 'end',
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  };
}

async function callOpenAI(model: string, apiKey: string, args: Parameters<CallModel>[0]): Promise<ModelReply> {
  const messages: any[] = [{ role: 'system', content: args.system }];
  args.turns.forEach((t) => {
    if (t.role === 'assistant') {
      const text = t.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n');
      const calls = t.content.filter((b) => b.type === 'tool_use') as Array<{ id: string; name: string; input: any }>;
      messages.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}),
      });
    } else if (typeof t.content === 'string') {
      messages.push({ role: 'user', content: t.content });
    } else {
      t.content.forEach((r) => messages.push({ role: 'tool', tool_call_id: r.tool_use_id, content: r.content }));
    }
  });
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: args.maxTokens ?? 2048,
      messages,
      tools: args.tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } })),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body: body.slice(0, 500) }, 'OpenAI API error');
    throw new AppError(`The AI service returned an error (${res.status}).`, 'AI_PROVIDER_ERROR', 502);
  }
  const data = await res.json() as any;
  const msg = data.choices?.[0]?.message || {};
  const content: Block[] = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  (msg.tool_calls || []).forEach((c: any) => {
    let input: any = {};
    try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = {}; }
    content.push({ type: 'tool_use', id: c.id, name: c.function?.name, input });
  });
  const finish = data.choices?.[0]?.finish_reason;
  return {
    content,
    stop: finish === 'tool_calls' || (msg.tool_calls || []).length ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end',
    usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
  };
}

export const callModel: CallModel = async (args) => {
  const { provider, model, apiKey } = await config();
  return provider === 'openai' ? callOpenAI(model, apiKey, args) : callAnthropic(model, apiKey, args);
};
