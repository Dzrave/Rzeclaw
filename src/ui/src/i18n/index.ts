import type { Locale, Namespace, TranslationMap, InterpolationParams } from './types.js';

// ── Storage key ──
const LOCALE_STORAGE_KEY = 'rezbot-locale';
const DEFAULT_LOCALE: Locale = 'zh-CN';
const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en', 'ja'];

// ── State ──
let currentLocale: Locale = DEFAULT_LOCALE;
const loadedBundles = new Map<string, TranslationMap>();
const listeners: Array<(locale: Locale) => void> = [];

// ── Bundle loader (dynamic import) ──
async function loadNamespace(locale: Locale, ns: Namespace): Promise<TranslationMap> {
  const key = `${locale}:${ns}`;
  if (loadedBundles.has(key)) return loadedBundles.get(key)!;

  try {
    const mod = await import(`./locales/${locale}/${ns}.json`);
    const map: TranslationMap = mod.default ?? mod;
    loadedBundles.set(key, map);
    return map;
  } catch {
    console.warn(`[i18n] Missing bundle: ${key}`);
    return {};
  }
}

// ── Public API ──

/** Initialize i18n: detect saved locale, preload 'common' namespace */
export async function initI18n(): Promise<void> {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (saved && SUPPORTED_LOCALES.includes(saved)) {
    currentLocale = saved;
  } else {
    // Detect browser locale
    const browserLang = navigator.language;
    if (browserLang.startsWith('zh')) currentLocale = 'zh-CN';
    else if (browserLang.startsWith('ja')) currentLocale = 'ja';
    else currentLocale = 'en';
  }
  // Preload common namespace
  await loadNamespace(currentLocale, 'common');
}

/** Get the current locale */
export function getLocale(): Locale {
  return currentLocale;
}

/** Get all supported locales */
export function getSupportedLocales(): Locale[] {
  return [...SUPPORTED_LOCALES];
}

/** Locale display names */
export function getLocaleDisplayName(locale: Locale): string {
  const names: Record<Locale, string> = {
    'zh-CN': '简体中文',
    'en': 'English',
    'ja': '日本語',
  };
  return names[locale] ?? locale;
}

/** Switch locale globally */
export async function setLocale(locale: Locale): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    console.error(`[i18n] Unsupported locale: ${locale}`);
    return;
  }
  currentLocale = locale;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);

  // Preload common for new locale
  await loadNamespace(locale, 'common');

  // Notify all listeners
  for (const fn of listeners) {
    try { fn(locale); } catch (e) { console.error('[i18n] Listener error:', e); }
  }
}

/** Subscribe to locale changes */
export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Translate a key with optional interpolation.
 *
 * Usage:
 *   t('common.nav.chat')
 *   t('chat.message.count', { count: 5 })
 *
 * The first segment of the key is the namespace.
 */
export function t(key: string, params?: InterpolationParams): string {
  const dotIdx = key.indexOf('.');
  if (dotIdx < 0) return key;

  const ns = key.substring(0, dotIdx) as Namespace;
  const subKey = key.substring(dotIdx + 1);
  const bundleKey = `${currentLocale}:${ns}`;
  const bundle = loadedBundles.get(bundleKey);

  if (!bundle) {
    // Try to load async — return key as fallback for now
    loadNamespace(currentLocale, ns);
    return subKey;
  }

  let text: string | undefined = bundle[subKey];
  if (text === undefined) {
    // Fallback to English
    if (currentLocale !== 'en') {
      const enBundle = loadedBundles.get(`en:${ns}`);
      if (enBundle) text = enBundle[subKey];
    }
    if (text === undefined) return subKey;
  }

  // Interpolation: replace {key} placeholders
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}

/**
 * Ensure a namespace is loaded for the current locale.
 * Call this when entering a page that uses a specific namespace.
 */
export async function ensureNamespace(ns: Namespace): Promise<void> {
  await loadNamespace(currentLocale, ns);
  // Also preload English as fallback
  if (currentLocale !== 'en') {
    await loadNamespace('en', ns);
  }
}
