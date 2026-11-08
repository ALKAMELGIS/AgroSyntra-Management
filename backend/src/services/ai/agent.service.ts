import { dbPool } from '../../db/client';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { callModel as defaultCallModel, CallModel, Turn, Block } from './llm';
import { TOOL_DEFS, runTool, ToolContext, TurnState, Artifact } from './tools';

/**
 * AgroCloud AI assistant (phase 1–2: answers, reports, guidance; read only).
 * The model never sees the database directly: it calls the tools in tools.ts,
 * which apply the user's organisation and site access on the server.
 */

const MAX_ROUNDS = 8;
const HISTORY = 12;
const HOURLY_LIMIT = 60;
const assignments = new AssignmentRepository();

export interface Requester { userId: string; role: string; orgId: string; name?: string | null }

async function siteScope(r: Requester): Promise<string[] | null> {
  if (r.role === 'ceo') return null;
  return assignments.getUserAccessibleSiteIds(r.userId, r.role, r.orgId);
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function systemPrompt(r: Requester, lang: 'ar' | 'en', siteCount: number | null) {
  return `You are the AgroCloud assistant for farm staff. Today is ${today()} (Asia/Dubai).
User: ${r.name || 'user'}, role ${r.role}. ${siteCount === null ? 'Sees every site of the organisation.' : `Sees ${siteCount} site(s) only.`}

Rules:
- Answer only from the system's database through the tools. Never invent numbers, names or dates. If the tools return nothing, say there is no data for that.
- Data lives in forms (each has a FORM_ID). Use list_forms / describe_form to find the right form and fields, find_locations to resolve names of zones, sites and fields, then query_records or aggregate_records.
- For any list, table or report the user wants, call show_result (it gives the user a table with Excel and PDF export, and a chart if useful). Do not repeat the rows in your text; summarise the key figures in 1–3 sentences.
- For "how do I…" questions use app_guide and give short numbered steps with the screen path.
- You can read only. If asked to create, change, approve or delete something, explain which screen does it (the assistant cannot change data yet).
- Reply in ${lang === 'ar' ? 'Arabic' : 'English'} (match the user's language), short and clear, Markdown allowed (bold, lists, small tables). Keep codes, field names and numbers as they are.
- Mention the period and the form(s) the figures come from.`;
}

async function checkRate(userId: string) {
  const { rows } = await dbPool.query(
    `SELECT COUNT(*)::int AS n FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 AND m.role = 'user' AND m.created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  );
  if (rows[0].n >= HOURLY_LIMIT) throw new AppError('Too many questions in the last hour — please wait a little.', 'RATE_LIMITED', 429);
}

export async function listConversations(r: Requester) {
  const { rows } = await dbPool.query(
    `SELECT id, title, created_at, updated_at FROM ai_conversations
      WHERE user_id = $1 AND organization_id = $2 ORDER BY updated_at DESC LIMIT 100`,
    [r.userId, r.orgId],
  );
  return rows;
}

async function ownConversation(r: Requester, id: string) {
  const { rows } = await dbPool.query(
    `SELECT id, title FROM ai_conversations WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
    [id, r.userId, r.orgId],
  );
  if (!rows.length) throw new AppError('Conversation not found', 'NOT_FOUND', 404);
  return rows[0];
}

export async function getMessages(r: Requester, conversationId: string) {
  await ownConversation(r, conversationId);
  const { rows } = await dbPool.query(
    `SELECT id, role, content, artifacts, sources, created_at FROM ai_messages
      WHERE conversation_id = $1 ORDER BY created_at, id`,
    [conversationId],
  );
  return rows;
}

export async function deleteConversation(r: Requester, conversationId: string) {
  await ownConversation(r, conversationId);
  await dbPool.query(`DELETE FROM ai_conversations WHERE id = $1`, [conversationId]);
}

export interface AskResult {
  conversationId: string;
  message: { id: string; role: 'assistant'; content: string; artifacts: Artifact[]; sources: any[]; created_at: string };
}

/** One question → tool-calling loop → one stored answer. */
export async function ask(
  r: Requester,
  input: { conversationId?: string | null; text: string; lang?: 'ar' | 'en' },
  deps: { callModel?: CallModel } = {},
): Promise<AskResult> {
  const callModel = deps.callModel || defaultCallModel;
  const text = String(input.text || '').trim().slice(0, 4000);
  if (!text) throw new AppError('Write a question', 'VALIDATION_ERROR', 400);
  const lang: 'ar' | 'en' = input.lang === 'en' ? 'en' : input.lang === 'ar' ? 'ar' : (/[؀-ۿ]/.test(text) ? 'ar' : 'en');
  await checkRate(r.userId);

  let conversationId = input.conversationId || null;
  if (conversationId) {
    await ownConversation(r, conversationId);
  } else {
    const c = await dbPool.query(
      `INSERT INTO ai_conversations (organization_id, user_id, title) VALUES ($1, $2, $3) RETURNING id`,
      [r.orgId, r.userId, text.replace(/\s+/g, ' ').slice(0, 80)],
    );
    conversationId = c.rows[0].id as string;
  }

  const history = await dbPool.query(
    `SELECT role, content FROM (
       SELECT role, content, created_at, id FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2
     ) h ORDER BY created_at, id`,
    [conversationId, HISTORY],
  );
  await dbPool.query(`INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`, [conversationId, text]);

  const siteIds = await siteScope(r);
  const ctx: ToolContext = { orgId: r.orgId, userId: r.userId, role: r.role, siteIds, lang };
  const state: TurnState = { results: new Map(), artifacts: [], sources: new Map() };
  // Earlier turns as plain text; roles must alternate and start with the user.
  const past: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  history.rows.filter((m: any) => m.content).forEach((m: any) => {
    const last = past[past.length - 1];
    if (last && last.role === m.role) last.text += `\n\n${m.content}`;
    else past.push({ role: m.role, text: m.content });
  });
  while (past.length && past[0].role !== 'user') past.shift();
  if (past.length && past[past.length - 1].role === 'user') past.pop();
  const turns: Turn[] = [
    ...past.map((m): Turn => (m.role === 'user'
      ? { role: 'user', content: m.text }
      : { role: 'assistant', content: [{ type: 'text', text: m.text }] })),
    { role: 'user', content: text },
  ];
  const system = systemPrompt(r, lang, siteIds === null ? null : siteIds.length);
  const toolLog: any[] = [];
  let usage = { input: 0, output: 0 };
  let answer = '';

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const reply = await callModel({ system, turns, tools: TOOL_DEFS, maxTokens: 2048 });
    usage = { input: usage.input + reply.usage.input, output: usage.output + reply.usage.output };
    turns.push({ role: 'assistant', content: reply.content });
    const calls = reply.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    const said = reply.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (reply.stop !== 'tool_use' || !calls.length) {
      answer = said;
      break;
    }
    const results: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
    for (const call of calls) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const out = await runTool(call.name, call.input, ctx, state);
        const json = JSON.stringify(out);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: json.length > 60000 ? `${json.slice(0, 60000)}…` : json });
        toolLog.push({ tool: call.name, input: call.input, ok: true });
      } catch (e: any) {
        results.push({ type: 'tool_result', tool_use_id: call.id, content: `Error: ${e?.message || 'failed'}`, is_error: true });
        toolLog.push({ tool: call.name, input: call.input, ok: false, error: e?.message });
      }
    }
    turns.push({ role: 'user', content: results });
    if (round === MAX_ROUNDS - 1) answer = said || (lang === 'ar' ? 'لم أتمكن من إكمال الطلب، حاول صياغة السؤال بشكل أدق.' : 'I could not finish this request; please ask more specifically.');
  }

  const sources = [...state.sources.values()];
  const saved = await dbPool.query(
    `INSERT INTO ai_messages (conversation_id, role, content, artifacts, sources, tool_calls, input_tokens, output_tokens)
     VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [conversationId, answer, JSON.stringify(state.artifacts), JSON.stringify(sources), JSON.stringify(toolLog), usage.input, usage.output],
  );
  await dbPool.query(`UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
  logger.info({ userId: r.userId, tools: toolLog.map((t) => t.tool), tokens: usage }, 'AI assistant answered');

  return {
    conversationId: conversationId!,
    message: { id: saved.rows[0].id, role: 'assistant', content: answer, artifacts: state.artifacts, sources, created_at: saved.rows[0].created_at },
  };
}
