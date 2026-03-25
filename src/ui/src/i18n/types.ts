/** Supported locale codes */
export type Locale = 'zh-CN' | 'en' | 'ja';

/** Translation namespace (one per screen group) */
export type Namespace =
  | 'common'
  | 'chat'
  | 'office'
  | 'settings'
  | 'flows'
  | 'agents'
  | 'explore'
  | 'security'
  | 'rag'
  | 'diagnostics'
  | 'memory';

/** Flat key-value map of translations */
export type TranslationMap = Record<string, string>;

/** All namespaces for a single locale */
export type LocaleBundle = Partial<Record<Namespace, TranslationMap>>;

/** i18n interpolation params */
export type InterpolationParams = Record<string, string | number>;
