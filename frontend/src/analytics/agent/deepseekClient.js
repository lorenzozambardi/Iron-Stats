/**
 * DeepSeek API client wrapper with thinking-mode capability guards,
 * reasoning_content stripping, cache-hit accounting, and key testing.
 */

import { deepseekRequest } from './transport.js';

export const DEFAULT_PRICE_TABLE = {
  'deepseek-chat': {
    inputCacheHitPer1M: 0.028,
    inputCacheMissPer1M: 0.28,
    outputPer1M: 0.42,
  },
  'deepseek-reasoner': {
    inputCacheHitPer1M: 0.028,
    inputCacheMissPer1M: 0.28,
    outputPer1M: 0.42,
  },
};

export function getModelCapabilities(modelId) {
  const id = String(modelId || 'deepseek-chat').toLowerCase();
  const isThinking = id.includes('reasoner') || id.includes('thinking');
  return {
    isThinking,
    supportsTemperature: !isThinking,
    supportsTools: true,
    stripReasoningOnInput: true,
  };
}

/**
 * Removes reasoning_content from outgoing messages so DeepSeek never returns HTTP 400.
 */
export function sanitizeOutgoingMessages(messages) {
  return (messages || []).map((msg) => {
    const clean = { role: msg.role };
    if (msg.content !== undefined) clean.content = msg.content;
    if (msg.tool_calls && msg.tool_calls.length > 0) clean.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) clean.tool_call_id = msg.tool_call_id;
    if (msg.name) clean.name = msg.name;
    return clean;
  });
}

export function extractUsage(rawUsage) {
  const u = rawUsage || {};
  const promptTokens = Number(u.prompt_tokens || 0);
  const completionTokens = Number(u.completion_tokens || 0);
  const totalTokens = Number(u.total_tokens || promptTokens + completionTokens);
  const cacheHitTokens = Number(u.prompt_cache_hit_tokens || u.prompt_tokens_details?.cached_tokens || 0);
  const cacheMissTokens = Number(
    u.prompt_cache_miss_tokens !== undefined
      ? u.prompt_cache_miss_tokens
      : Math.max(0, promptTokens - cacheHitTokens)
  );
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cacheHitTokens,
    cacheMissTokens,
  };
}

export function estimateCostUsd(usage, modelId = 'deepseek-chat', priceTable = DEFAULT_PRICE_TABLE) {
  const rates = priceTable[modelId] || priceTable['deepseek-chat'] || DEFAULT_PRICE_TABLE['deepseek-chat'];
  const hit = Number(usage?.cacheHitTokens || 0);
  const miss = Number(usage?.cacheMissTokens ?? Math.max(0, Number(usage?.promptTokens || 0) - hit));
  const out = Number(usage?.completionTokens || 0);
  return (
    (hit / 1e6) * rates.inputCacheHitPer1M +
    (miss / 1e6) * rates.inputCacheMissPer1M +
    (out / 1e6) * rates.outputPer1M
  );
}

export async function createChatCompletion({
  apiKey,
  model = 'deepseek-chat',
  messages,
  tools = [],
  toolChoice = 'auto',
  temperature = 0.2,
  maxTokens = 4096,
  signal = null,
  requestImpl = deepseekRequest,
}) {
  const caps = getModelCapabilities(model);
  const payload = {
    model,
    messages: sanitizeOutgoingMessages(messages),
    max_tokens: maxTokens,
  };
  if (caps.supportsTemperature && temperature !== undefined) {
    payload.temperature = temperature;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }

  const resp = await requestImpl({
    path: '/chat/completions',
    method: 'POST',
    apiKey,
    body: payload,
    signal,
  });

  const choice = resp?.choices?.[0];
  if (!choice || !choice.message) {
    throw new Error('Malformed DeepSeek response: missing choices[0].message');
  }
  const msg = choice.message;
  const toolCalls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function?.name || '',
        rawArguments: tc.function?.arguments || '{}',
      }))
    : [];

  return {
    content: msg.content || '',
    reasoningContent: msg.reasoning_content || '',
    toolCalls,
    finishReason: choice.finish_reason || 'stop',
    usage: extractUsage(resp.usage),
  };
}

export async function testDeepSeekConnection({ apiKey, requestImpl = deepseekRequest, signal = null }) {
  const modelsResp = await requestImpl({
    path: '/models',
    method: 'GET',
    apiKey,
    signal,
    maxRetries: 1,
    timeoutMs: 15000,
  });
  const models = Array.isArray(modelsResp?.data) ? modelsResp.data.map((m) => m.id).filter(Boolean) : ['deepseek-chat'];

  let balance = null;
  try {
    const balResp = await requestImpl({
      path: '/user/balance',
      method: 'GET',
      apiKey,
      signal,
      maxRetries: 0,
      timeoutMs: 10000,
    });
    if (balResp && Array.isArray(balResp.balance_infos) && balResp.balance_infos.length > 0) {
      const info = balResp.balance_infos[0];
      balance = {
        isAvailable: Boolean(balResp.is_available),
        currency: info.currency || 'USD',
        totalBalance: info.total_balance || '0.00',
      };
    }
  } catch {
    // Balance endpoint is optional; models check already proved auth works
  }

  return { ok: true, models, balance };
}
