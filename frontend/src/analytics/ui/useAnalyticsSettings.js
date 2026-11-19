import { useCallback, useEffect, useState } from 'react';
import {
  ANALYTICS_SETTINGS_EVENT,
  computeKeyConsentHash,
  loadAnalyticsSettings,
  saveAnalyticsSettings,
} from '../storage/analyticsSettings.js';
import { clearApiKey, getApiKey, isNativeSecureStorage, setApiKey } from '../storage/secureStore.js';
import { clearAllReports, clearCheckpoint } from '../storage/reportStore.js';
import { testDeepSeekConnection } from '../agent/deepseekClient.js';

export function useAnalyticsSettings() {
  const [settings, setSettings] = useState(() => loadAnalyticsSettings());
  const [hasKey, setHasKey] = useState(false);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testMessage, setTestMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const syncKey = () => {
      getApiKey().then((key) => {
        if (cancelled) return;
        setHasKey(Boolean(key));
        setKeyLoaded(true);
      });
    };
    syncKey();
    const onSync = () => {
      setSettings(loadAnalyticsSettings());
      syncKey();
    };
    window.addEventListener(ANALYTICS_SETTINGS_EVENT, onSync);
    return () => {
      cancelled = true;
      window.removeEventListener(ANALYTICS_SETTINGS_EVENT, onSync);
    };
  }, []);

  const updateSettings = useCallback((patch) => {
    const current = loadAnalyticsSettings();
    const next = { ...current, ...patch };
    saveAnalyticsSettings(next);
    setSettings(next);
  }, []);

  const saveKey = useCallback(
    async (rawKey) => {
      const clean = (rawKey || '').trim();
      await setApiKey(clean);
      setHasKey(Boolean(clean));
      setTestMessage(null);
      updateSettings({
        keyStatus: clean ? 'saved' : 'unconfigured',
        lastBalance: clean ? settings.lastBalance : null,
      });
    },
    [settings.lastBalance, updateSettings]
  );

  const removeKey = useCallback(async () => {
    await clearApiKey();
    setHasKey(false);
    setTestMessage(null);
    updateSettings({
      keyStatus: 'unconfigured',
      consentKeyHash: null,
      lastBalance: null,
    });
  }, [updateSettings]);

  const testConnection = useCallback(
    async (overrideKey = null) => {
      setTestingKey(true);
      setTestMessage(null);
      try {
        const key = overrideKey ? overrideKey.trim() : await getApiKey();
        if (!key) {
          setTestMessage({ ok: false, text: 'Enter a DeepSeek API key first.' });
          updateSettings({ keyStatus: 'unconfigured' });
          return { ok: false };
        }
        if (overrideKey) {
          await setApiKey(key);
          setHasKey(true);
        }
        const res = await testDeepSeekConnection({ apiKey: key });
        const nextModels = res.models.length > 0 ? res.models : ['deepseek-chat', 'deepseek-reasoner'];
        const current = loadAnalyticsSettings();
        const nextModel = nextModels.includes(current.model) ? current.model : nextModels[0];
        updateSettings({
          keyStatus: 'valid',
          availableModels: nextModels,
          model: nextModel,
          lastBalance: res.balance,
        });
        const balText = res.balance
          ? ` Balance: ${res.balance.totalBalance} ${res.balance.currency}.`
          : '';
        setTestMessage({
          ok: true,
          text: `Connected (${nextModels.length} model${nextModels.length === 1 ? '' : 's'}).${balText}`,
        });
        return { ok: true, ...res };
      } catch (err) {
        const msg = err?.message || 'Connection failed.';
        updateSettings({ keyStatus: err?.status === 401 ? 'invalid' : 'saved' });
        setTestMessage({ ok: false, text: msg });
        return { ok: false, error: msg };
      } finally {
        setTestingKey(false);
      }
    },
    [updateSettings]
  );

  const hasConsentForCurrentKey = useCallback(async () => {
    const key = await getApiKey();
    if (!key) return false;
    const hash = computeKeyConsentHash(key);
    return Boolean(hash && loadAnalyticsSettings().consentKeyHash === hash);
  }, []);

  const grantConsentForCurrentKey = useCallback(async () => {
    const key = await getApiKey();
    if (!key) return false;
    updateSettings({ consentKeyHash: computeKeyConsentHash(key) });
    return true;
  }, [updateSettings]);

  const clearCachedReports = useCallback(async () => {
    await clearAllReports();
    await clearCheckpoint();
  }, []);

  return {
    settings,
    hasKey,
    keyLoaded,
    isNativeSecure: isNativeSecureStorage(),
    testingKey,
    testMessage,
    updateSettings,
    saveKey,
    removeKey,
    testConnection,
    hasConsentForCurrentKey,
    grantConsentForCurrentKey,
    clearCachedReports,
  };
}
