/**
 * Non-secret analytics preferences persisted in localStorage, with cross-component sync events.
 */

import { DEFAULT_PRICE_TABLE } from '../agent/deepseekClient.js';
import { hashString } from '../dataset/fingerprint.js';

export const ANALYTICS_SETTINGS_KEY = 'iron_stats_analytics_settings_v1';
export const ANALYTICS_SETTINGS_EVENT = 'iron-stats-analytics-settings-changed';

export const REPORT_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'Italian', label: 'Italiano' },
  { id: 'auto', label: 'Follow Device Locale' },
];

export const DEFAULT_ANALYTICS_SETTINGS = {
  model: 'deepseek-chat',
  availableModels: ['deepseek-chat', 'deepseek-reasoner'],
  depth: 'deep',
  language: 'en',
  anonymize: false,
  consentKeyHash: null,
  keyStatus: 'unconfigured', // 'unconfigured' | 'saved' | 'valid' | 'invalid'
  lastBalance: null,
  priceTable: DEFAULT_PRICE_TABLE,
};

export function loadAnalyticsSettings() {
  try {
    if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_ANALYTICS_SETTINGS);
    const raw = localStorage.getItem(ANALYTICS_SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_ANALYTICS_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ANALYTICS_SETTINGS,
      ...parsed,
      availableModels:
        Array.isArray(parsed.availableModels) && parsed.availableModels.length > 0
          ? parsed.availableModels
          : DEFAULT_ANALYTICS_SETTINGS.availableModels,
      priceTable: { ...DEFAULT_PRICE_TABLE, ...(parsed.priceTable || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_ANALYTICS_SETTINGS);
  }
}

export function saveAnalyticsSettings(next) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ANALYTICS_SETTINGS_KEY, JSON.stringify(next));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT));
    }
  } catch {
    // ignore
  }
}

export function computeKeyConsentHash(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;
  return hashString(`consent:${apiKey.trim()}`);
}

export function resolveReportLanguage(settingValue) {
  if (settingValue && settingValue !== 'auto') return settingValue;
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.toLowerCase().startsWith('it')) return 'Italian';
    return navigator.language;
  }
  return 'en';
}
