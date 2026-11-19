/**
 * Secure API key storage adapter.
 * - Native Android: uses Android Keystore AES-GCM encrypted SharedPreferences via SecureStorePlugin.
 * - Web/Dev: uses localStorage fallback (UI surfaces an explicit notice on web).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const SecureStore = registerPlugin('SecureStore');

const DEEPSEEK_KEY_NAME = 'deepseek_api_key';
const WEB_FALLBACK_KEY = 'iron_stats_deepseek_api_key_web';

export function isNativeSecureStorage() {
  return Capacitor.isNativePlatform();
}

export async function getApiKey() {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await SecureStore.get({ key: DEEPSEEK_KEY_NAME });
      return typeof res?.value === 'string' && res.value.trim() ? res.value.trim() : null;
    } catch {
      return null;
    }
  }
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(WEB_FALLBACK_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export async function setApiKey(apiKey) {
  const clean = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!clean) {
    await clearApiKey();
    return;
  }
  if (Capacitor.isNativePlatform()) {
    await SecureStore.set({ key: DEEPSEEK_KEY_NAME, value: clean });
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WEB_FALLBACK_KEY, clean);
  }
}

export async function clearApiKey() {
  if (Capacitor.isNativePlatform()) {
    try {
      await SecureStore.remove({ key: DEEPSEEK_KEY_NAME });
    } catch {
      // Ignore
    }
    return;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WEB_FALLBACK_KEY);
    }
  } catch {
    // Ignore
  }
}
