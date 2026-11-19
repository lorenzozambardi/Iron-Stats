/**
 * HTTP transport for DeepSeek API.
 * - Native Android (Capacitor): uses CapacitorHttp.request directly (no CORS, no fetch monkey-patch clash).
 * - Web Dev (Vite): uses /__deepseek reverse proxy.
 * - Web Prod / Node: uses direct https://api.deepseek.com (or injected fetchImpl in tests).
 * Implements AbortSignal, timeout, exponential backoff with jitter on 429/500/503, and header redaction.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const DEEPSEEK_ORIGIN = 'https://api.deepseek.com';

export class TransportError extends Error {
  constructor(message, { status = 0, code = 'transport_error', retryable = false, body = null } = {}) {
    super(message);
    this.name = 'TransportError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.body = body;
  }
}

export function resolveEndpointUrl(path, { baseUrl } = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (baseUrl) return `${baseUrl.replace(/\/$/, '')}${cleanPath}`;
  if (Capacitor.isNativePlatform()) {
    return `${DEEPSEEK_ORIGIN}${cleanPath}`;
  }
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
  if (isDev && typeof window !== 'undefined') {
    return `/__deepseek${cleanPath}`;
  }
  return `${DEEPSEEK_ORIGIN}${cleanPath}`;
}

function classifyHttpError(status, parsedBody) {
  const apiMsg =
    parsedBody?.error?.message ||
    (typeof parsedBody?.message === 'string' ? parsedBody.message : null) ||
    `HTTP ${status}`;

  if (status === 401) {
    return new TransportError('Invalid or unauthorized DeepSeek API key.', { status, code: 'auth_failed', retryable: false });
  }
  if (status === 402) {
    return new TransportError('Insufficient DeepSeek account balance. Top up your balance on platform.deepseek.com.', {
      status,
      code: 'insufficient_balance',
      retryable: false,
    });
  }
  if (status === 400 || status === 422) {
    const isContextOverflow = /context|maximum.*length|token/i.test(apiMsg);
    return new TransportError(apiMsg, {
      status,
      code: isContextOverflow ? 'context_overflow' : 'bad_request',
      retryable: false,
      body: parsedBody,
    });
  }
  if (status === 429) {
    return new TransportError('DeepSeek rate limit reached. Retrying shortly.', { status, code: 'rate_limited', retryable: true });
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new TransportError(`DeepSeek service temporarily unavailable (${status}).`, { status, code: 'server_error', retryable: true });
  }
  return new TransportError(apiMsg, { status, code: 'http_error', retryable: status >= 500 });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransportError('Request cancelled', { code: 'aborted', retryable: false }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new TransportError('Request cancelled', { code: 'aborted', retryable: false }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfterMs(headers) {
  if (!headers) return null;
  const raw =
    typeof headers.get === 'function'
      ? headers.get('retry-after')
      : headers['retry-after'] || headers['Retry-After'];
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return Math.min(30000, secs * 1000);
  return null;
}

export async function deepseekRequest({
  path,
  method = 'POST',
  apiKey,
  body = null,
  signal = null,
  timeoutMs = 120000,
  maxRetries = 3,
  baseUrl = null,
  fetchImpl = null,
  sleepImpl = sleep,
}) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new TransportError('Missing DeepSeek API key.', { status: 401, code: 'auth_failed', retryable: false });
  }

  const url = resolveEndpointUrl(path, { baseUrl });
  const headers = {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const backoffSchedule = [1000, 3000, 9000];
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new TransportError('Request cancelled', { code: 'aborted', retryable: false });
    }

    try {
      let status;
      let data;
      let respHeaders;

      if (!fetchImpl && Capacitor.isNativePlatform()) {
        const resp = await CapacitorHttp.request({
          url,
          method,
          headers,
          data: body !== null ? body : undefined,
          connectTimeout: 20000,
          readTimeout: timeoutMs,
        });
        status = resp.status;
        respHeaders = resp.headers || {};
        if (typeof resp.data === 'string') {
          try { data = JSON.parse(resp.data); } catch { data = { raw: resp.data }; }
        } else {
          data = resp.data;
        }
      } else {
        const activeFetch = fetchImpl || globalThis.fetch;
        const controller = new AbortController();
        const onOuterAbort = () => controller.abort();
        signal?.addEventListener('abort', onOuterAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const resp = await activeFetch(url, {
            method,
            headers,
            body: body !== null && method !== 'GET' ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
          status = resp.status;
          respHeaders = resp.headers;
          const text = await resp.text();
          try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onOuterAbort);
        }
      }

      if (status >= 200 && status < 300) {
        return data;
      }

      const err = classifyHttpError(status, data);
      lastError = err;
      if (!err.retryable || attempt >= maxRetries) {
        throw err;
      }

      const retryAfter = parseRetryAfterMs(respHeaders);
      const jitter = Math.floor(Math.random() * 400);
      const delay = retryAfter ?? (backoffSchedule[attempt] || 9000) + jitter;
      await sleepImpl(delay, signal);
    } catch (err) {
      if (err instanceof TransportError) {
        lastError = err;
        if (!err.retryable || attempt >= maxRetries) throw err;
        const delay = (backoffSchedule[attempt] || 9000) + Math.floor(Math.random() * 400);
        await sleepImpl(delay, signal);
        continue;
      }

      if (signal?.aborted) {
        throw new TransportError('Request cancelled', { code: 'aborted', retryable: false });
      }
      const isAbortTimeout = err?.name === 'AbortError';
      const wrapped = new TransportError(
        isAbortTimeout ? 'DeepSeek request timed out.' : 'Network error communicating with DeepSeek.',
        { status: 0, code: isAbortTimeout ? 'timeout' : 'network_error', retryable: true }
      );
      lastError = wrapped;
      if (attempt >= maxRetries) throw wrapped;
      const delay = (backoffSchedule[attempt] || 9000) + Math.floor(Math.random() * 400);
      await sleepImpl(delay, signal);
    }
  }

  throw lastError || new TransportError('Unknown transport error', { code: 'unknown' });
}
