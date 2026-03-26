/**
 * System Settings Page — Screen 03
 * General / Appearance / Gateway / LLM / Memory / Modules sections
 */

import { t, ensureNamespace, getLocale, setLocale, getSupportedLocales, getLocaleDisplayName } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;
let activeSection = 'general';
let configData: Record<string, unknown> = {};
let fontScale = parseFloat(localStorage.getItem('rezbot-font-scale') || '1');
let reloadInProgress = false;

/* ─── Theme Engine (P2-17) ─── */
interface ThemePrefs {
  mode: 'dark' | 'light' | 'system';
  accentColor: string;
}

const DEFAULT_ACCENT = '#a3a6ff';

function loadThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem('rezbot-theme');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { mode: 'dark', accentColor: DEFAULT_ACCENT };
}

function saveThemePrefs(prefs: ThemePrefs): void {
  localStorage.setItem('rezbot-theme', JSON.stringify(prefs));
}

let themePrefs = loadThemePrefs();

/** Apply current theme preferences to the document */
function applyTheme(prefs: ThemePrefs): void {
  const resolved = prefs.mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : prefs.mode;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.setProperty('--color-primary', prefs.accentColor);

  // Derive dimmed variant from accent (simple approach: reduce lightness)
  document.documentElement.style.setProperty('--color-primary-dim', adjustBrightness(prefs.accentColor, -0.15));
}

function adjustBrightness(hex: string, amount: number): string {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(amount * 255)));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(amount * 255)));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(amount * 255)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Listen for system theme changes when in "system" mode
const systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: light)');
systemThemeMediaQuery.addEventListener('change', () => {
  if (themePrefs.mode === 'system') applyTheme(themePrefs);
});

// Apply theme on module load
applyTheme(themePrefs);

const SECTIONS = [
  { id: 'general', labelKey: 'settings.section.general' },
  { id: 'appearance', labelKey: 'settings.section.appearance' },
  { id: 'gateway', labelKey: 'settings.section.gateway' },
  { id: 'llm', labelKey: 'settings.section.llm' },
  { id: 'memory', labelKey: 'settings.section.memory' },
  { id: 'ideAutomation', labelKey: 'settings.section.ideAutomation' },
  { id: 'heartbeat', labelKey: 'settings.section.heartbeat' },
  { id: 'modules', labelKey: 'settings.section.modules' },
];

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('settings');
  loadConfig();
  renderFull();
}

export function cleanup(): void {
  container = null;
}

async function loadConfig(): Promise<void> {
  try {
    const result = await GatewayClient.call<{ config: Record<string, unknown> }>('config.get', {});
    if (result?.config) {
      configData = result.config;
      renderFull();
    }
  } catch {
    // config.get RPC may not exist yet
  }
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex h-full">
      <!-- Settings Sidebar -->
      <div class="w-52 shrink-0 border-r border-outline-variant/20 bg-surface-container-lowest py-4 px-3">
        <h2 class="px-3 mb-3 text-sm font-headline font-semibold text-on-surface">
          ${t('settings.title') || '系统设置'}
        </h2>
        <nav class="space-y-0.5">
          ${SECTIONS.map(s => {
            const isActive = s.id === activeSection;
            return `
              <button class="settings-section-btn w-full text-left px-3 py-2 rounded-lg text-sm transition
                             ${isActive ? 'bg-primary/12 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-high'}"
                      data-section="${s.id}">
                ${t(s.labelKey) || s.id}
              </button>
            `;
          }).join('')}
        </nav>
      </div>

      <!-- Settings Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="max-w-2xl">
          ${renderSection()}
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function renderSection(): string {
  switch (activeSection) {
    case 'general': return renderGeneralSection();
    case 'appearance': return renderAppearanceSection();
    case 'gateway': return renderGatewaySection();
    case 'llm': return renderLLMSection();
    case 'memory': return renderMemorySection();
    case 'ideAutomation': return renderIdeAutomationSection();
    case 'heartbeat': return renderHeartbeatSection();
    case 'modules': return renderModulesSection();
    default: return '';
  }
}

function renderGeneralSection(): string {
  const locale = getLocale();
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">
      ${t('settings.section.general') || '通用'}
    </h3>
    <div class="space-y-4">
      ${settingsField(t('settings.language') || '语言', `
        <select id="settings-locale"
                class="w-48 h-9 px-3 rounded-lg bg-surface-container-high text-sm text-on-surface
                       border border-outline-variant/30 focus:border-primary outline-none">
          ${getSupportedLocales().map(l => `
            <option value="${l}" ${l === locale ? 'selected' : ''}>${getLocaleDisplayName(l)}</option>
          `).join('')}
        </select>
      `)}
      ${settingsField(t('settings.workspace') || '工作区', `
        <div class="text-sm text-on-surface font-mono bg-surface-container-high px-3 py-2 rounded-lg border border-outline-variant/20">
          ${configData.workspace ?? '—'}
        </div>
        <p class="text-xs text-on-surface-variant/50 mt-1">${t('settings.notReloadable') || '不可运行时修改'}</p>
      `)}
      ${settingsField(t('settings.port') || '端口', `
        <div class="text-sm text-on-surface font-mono bg-surface-container-high px-3 py-2 rounded-lg border border-outline-variant/20">
          ${configData.port ?? 18789}
        </div>
        <p class="text-xs text-on-surface-variant/50 mt-1">${t('settings.notReloadable') || '不可运行时修改'}</p>
      `)}
    </div>
  `;
}

function renderAppearanceSection(): string {
  const currentMode = themePrefs.mode;
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">
      ${t('settings.section.appearance') || '外观'}
    </h3>
    <div class="space-y-6">
      ${settingsField(t('settings.theme') || '主题', `
        <div class="flex gap-3">
          ${(['dark', 'light', 'system'] as const).map(mode => {
            const isActive = currentMode === mode;
            const label = mode === 'dark' ? (t('settings.theme.dark') || '深色')
                        : mode === 'light' ? (t('settings.theme.light') || '浅色')
                        : (t('settings.theme.system') || '跟随系统');
            return `
              <label class="flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition
                            ${isActive ? 'border-2 border-primary bg-primary/5' : 'border border-outline-variant/30 hover:bg-surface-container-high'}">
                <input type="radio" name="theme" value="${mode}" ${isActive ? 'checked' : ''} class="accent-primary" />
                <span class="text-sm ${isActive ? 'font-medium' : ''}">${label}</span>
              </label>
            `;
          }).join('')}
        </div>
      `)}
      ${settingsField(t('settings.accentColor') || '自定义强调色', `
        <div class="flex items-center gap-4">
          <input type="color" id="accent-color-picker"
                 value="${themePrefs.accentColor}"
                 class="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30 bg-transparent" />
          <span id="accent-color-value" class="text-sm font-mono text-on-surface-variant">${themePrefs.accentColor}</span>
          <button id="accent-color-reset"
                  class="ml-auto px-3 py-1.5 rounded-lg text-xs border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition">
            ${t('settings.reset') || '重置'}
          </button>
        </div>
      `)}
      ${settingsField(t('settings.fontScale') || '字体缩放', `
        <div class="flex items-center gap-4">
          <input type="range" id="font-scale-slider"
                 min="0.75" max="1.5" step="0.05" value="${fontScale}"
                 class="flex-1 accent-primary" />
          <span id="font-scale-value" class="w-12 text-sm text-on-surface font-mono text-right">${Math.round(fontScale * 100)}%</span>
        </div>
        <div class="flex gap-2 mt-2">
          ${[75, 100, 125, 150].map(pct => `
            <button class="font-preset-btn px-3 py-1 rounded-lg text-xs border border-outline-variant/30
                           ${Math.round(fontScale * 100) === pct ? 'bg-primary/10 text-primary border-primary/30' : 'text-on-surface-variant hover:bg-surface-container-high'}
                           transition" data-scale="${pct / 100}">${pct}%</button>
          `).join('')}
        </div>
        <div class="mt-3 p-3 rounded-lg bg-surface-container-high border border-outline-variant/20">
          <p class="text-xs text-on-surface-variant/50 mb-1">Preview</p>
          <p style="font-size: calc(16px * ${fontScale})" class="font-title text-on-surface">Title Text</p>
          <p style="font-size: calc(14px * ${fontScale})" class="text-on-surface">Body text at current scale.</p>
          <p style="font-size: calc(14px * ${fontScale})" class="font-mono text-secondary">const code = "monospace";</p>
        </div>
      `)}
    </div>
  `;
}

function renderGatewaySection(): string {
  const gw = configData.gateway as Record<string, unknown> | undefined;
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">Gateway</h3>
    <div class="space-y-4">
      ${settingsField('Host', `<div class="text-sm font-mono text-on-surface">${gw?.host ?? '127.0.0.1'}</div>`)}
      ${settingsField('Discovery (mDNS)', `<div class="text-sm text-on-surface">${(gw?.discovery as Record<string, unknown>)?.enabled ? '✓ Enabled' : '✗ Disabled'}</div>`)}
      ${settingsField(t('settings.hotReload') || '热重载', `
        <div class="flex items-center gap-3">
          <button id="reload-config-btn"
                  class="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition flex items-center gap-2
                         ${reloadInProgress ? 'opacity-50 pointer-events-none' : ''}"
                  ${reloadInProgress ? 'disabled' : ''}>
            <svg class="w-4 h-4 ${reloadInProgress ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            ${reloadInProgress ? (t('settings.reloading') || '重载中…') : (t('settings.reloadNow') || '立即重载')}
          </button>
          <span id="reload-status" class="text-xs text-on-surface-variant/60"></span>
        </div>
      `)}
    </div>
  `;
}

function renderLLMSection(): string {
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">LLM</h3>
    <div class="space-y-4">
      ${settingsField(t('settings.model') || '模型', `<div class="text-sm font-mono text-on-surface">${configData.model ?? 'anthropic/claude-sonnet-4-20250514'}</div>`)}
      ${settingsField(t('settings.contextWindow') || '上下文窗口轮次', `<div class="text-sm text-on-surface">${configData.contextWindowRounds ?? 10}</div>`)}
      ${settingsField(t('settings.summaryEvery') || '摘要间隔轮次', `<div class="text-sm text-on-surface">${configData.summaryEveryRounds ?? 5}</div>`)}
    </div>
  `;
}

function renderMemorySection(): string {
  const mem = configData.memory as Record<string, unknown> | undefined;
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">${t('settings.section.memory') || '记忆'}</h3>
    <div class="space-y-4">
      ${settingsField('Cold After Days', `<div class="text-sm text-on-surface">${mem?.coldAfterDays ?? 30}</div>`)}
      ${settingsField('L2 Enabled', `<div class="text-sm text-on-surface">${mem?.l2Enabled !== false ? '✓ Yes' : '✗ No'}</div>`)}
    </div>
  `;
}

/* ─── P2-20: IDE Automation Config (display-only) ─── */
function renderIdeAutomationSection(): string {
  const ide = configData.ideAutomation as Record<string, unknown> | undefined;
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">
      ${t('settings.section.ideAutomation') || 'IDE Automation'}
    </h3>
    <div class="mb-4 px-4 py-2.5 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs">
      ${t('settings.ide.comingSoon') || 'These settings are display-only for now. Full IDE automation is coming soon.'}
    </div>
    <div class="space-y-4">
      ${settingsField(t('settings.ide.type') || 'IDE Type', `
        <select disabled
                class="w-48 h-9 px-3 rounded-lg bg-surface-container-high text-sm text-on-surface/50
                       border border-outline-variant/30 cursor-not-allowed">
          ${(['VSCode', 'JetBrains', 'Cursor'] as const).map(opt => `
            <option value="${opt.toLowerCase()}" ${(ide?.type as string)?.toLowerCase() === opt.toLowerCase() ? 'selected' : ''}>
              ${opt}
            </option>
          `).join('')}
        </select>
      `)}
      ${settingsField(t('settings.ide.workspacePath') || 'Workspace Path', `
        <div class="text-sm font-mono text-on-surface/50 bg-surface-container-high px-3 py-2 rounded-lg border border-outline-variant/20">
          ${ide?.workspacePath ?? configData.workspace ?? '—'}
        </div>
        <p class="text-xs text-on-surface-variant/50 mt-1">${t('settings.ide.readOnly') || 'Read-only from config'}</p>
      `)}
      ${settingsField(t('settings.ide.autoSync') || 'Auto-sync', `
        <div class="flex items-center gap-3">
          <div class="w-10 h-5 rounded-full ${ide?.autoSync ? 'bg-primary/40' : 'bg-outline-variant/30'} relative cursor-not-allowed">
            <div class="absolute top-0.5 ${ide?.autoSync ? 'left-5' : 'left-0.5'} w-4 h-4 rounded-full bg-surface shadow transition-all"></div>
          </div>
          <span class="text-sm text-on-surface/50">${ide?.autoSync ? (t('settings.ide.enabled') || 'Enabled') : (t('settings.ide.disabled') || 'Disabled')}</span>
        </div>
      `)}
    </div>
  `;
}

/* ─── P2-21: Heartbeat Config ─── */
function renderHeartbeatSection(): string {
  const hb = configData.heartbeat as Record<string, unknown> | undefined;
  const intervalMinutes = (hb?.intervalMinutes as number) ?? 0;
  const checklistPath = (hb?.checklistPath as string) ?? '';
  const isEnabled = intervalMinutes > 0;

  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">
      ${t('settings.section.heartbeat') || 'Heartbeat'}
    </h3>
    <div class="space-y-4">
      ${settingsField(t('settings.heartbeat.status') || 'Status', `
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-success animate-pulse' : 'bg-outline-variant'}"></span>
          <span class="text-sm ${isEnabled ? 'text-success' : 'text-on-surface-variant/60'}">
            ${isEnabled ? (t('settings.heartbeat.active') || 'Active') : (t('settings.heartbeat.inactive') || 'Inactive')}
          </span>
        </div>
      `)}
      ${settingsField(t('settings.heartbeat.interval') || 'Interval (minutes)', `
        <input type="number" id="heartbeat-interval"
               value="${intervalMinutes}"
               min="0" step="1"
               class="w-32 h-9 px-3 rounded-lg bg-surface-container-high text-sm text-on-surface
                      border border-outline-variant/30 focus:border-primary outline-none" />
        <p class="text-xs text-on-surface-variant/50 mt-1">${t('settings.heartbeat.intervalHint') || 'Set to 0 to disable heartbeat'}</p>
      `)}
      ${settingsField(t('settings.heartbeat.checklistPath') || 'Checklist Path', `
        <input type="text" id="heartbeat-checklist"
               value="${escapeAttr(checklistPath)}"
               placeholder="${t('settings.heartbeat.checklistPlaceholder') || 'e.g. ./checklists/daily.md'}"
               class="w-full h-9 px-3 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                      border border-outline-variant/30 focus:border-primary outline-none" />
      `)}
    </div>
  `;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderModulesSection(): string {
  const modules: Array<[string, boolean]> = [
    ['Skills', (configData.skills as Record<string, unknown>)?.enabled !== false],
    ['Flows', (configData.flows as Record<string, unknown>)?.enabled !== false],
    ['MCP', (configData.mcp as Record<string, unknown>)?.enabled !== false],
    ['Vector Embedding (RAG)', (configData.vectorEmbedding as Record<string, unknown>)?.enabled !== false],
    ['Evolution', (configData.evolution as Record<string, unknown>)?.enabled === true],
    ['Heartbeat', ((configData.heartbeat as Record<string, unknown>)?.intervalMinutes as number ?? 0) > 0],
    ['Exploration', (configData.exploration as Record<string, unknown>)?.enabled === true],
    ['Event Bus', (configData.eventBus as Record<string, unknown>)?.enabled === true],
    ['Security', (configData.security as Record<string, unknown>)?.enabled !== false],
  ];

  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-6">${t('settings.section.modules') || '模块开关'}</h3>
    <div class="grid grid-cols-2 gap-3">
      ${modules.map(([name, enabled]) => `
        <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/20">
          <span class="text-sm text-on-surface">${name}</span>
          <span class="w-2 h-2 rounded-full ${enabled ? 'bg-success' : 'bg-outline-variant'}"></span>
        </div>
      `).join('')}
    </div>
  `;
}

function settingsField(label: string, content: string): string {
  return `
    <div class="py-3 border-b border-outline-variant/10">
      <label class="block text-sm font-medium text-on-surface mb-2">${label}</label>
      ${content}
    </div>
  `;
}

function bindEvents(): void {
  if (!container) return;

  container.querySelectorAll('.settings-section-btn').forEach(el => {
    el.addEventListener('click', () => {
      activeSection = (el as HTMLElement).dataset.section ?? 'general';
      renderFull();
    });
  });

  const localeSelect = container.querySelector('#settings-locale') as HTMLSelectElement;
  localeSelect?.addEventListener('change', async () => {
    await setLocale(localeSelect.value as 'zh-CN' | 'en' | 'ja');
  });

  const slider = container.querySelector('#font-scale-slider') as HTMLInputElement;
  slider?.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    fontScale = val;
    document.documentElement.style.setProperty('--font-scale', String(val));
    localStorage.setItem('rezbot-font-scale', String(val));
    const display = container?.querySelector('#font-scale-value');
    if (display) display.textContent = `${Math.round(val * 100)}%`;
  });

  container.querySelectorAll('.font-preset-btn').forEach(el => {
    el.addEventListener('click', () => {
      const scale = parseFloat((el as HTMLElement).dataset.scale ?? '1');
      fontScale = scale;
      document.documentElement.style.setProperty('--font-scale', String(scale));
      localStorage.setItem('rezbot-font-scale', String(scale));
      renderFull();
    });
  });

  // ─── Theme radio buttons ───
  container.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', () => {
      themePrefs.mode = radio.value as ThemePrefs['mode'];
      saveThemePrefs(themePrefs);
      applyTheme(themePrefs);
      renderFull();
    });
  });

  // ─── Accent color picker ───
  const accentPicker = container.querySelector('#accent-color-picker') as HTMLInputElement;
  accentPicker?.addEventListener('input', () => {
    themePrefs.accentColor = accentPicker.value;
    saveThemePrefs(themePrefs);
    applyTheme(themePrefs);
    const valueLabel = container?.querySelector('#accent-color-value');
    if (valueLabel) valueLabel.textContent = accentPicker.value;
  });

  const accentReset = container.querySelector('#accent-color-reset');
  accentReset?.addEventListener('click', () => {
    themePrefs.accentColor = DEFAULT_ACCENT;
    saveThemePrefs(themePrefs);
    applyTheme(themePrefs);
    renderFull();
  });

  // ─── Config Hot Reload (P2-19) ───
  const reloadBtn = container.querySelector('#reload-config-btn');
  reloadBtn?.addEventListener('click', async () => {
    if (reloadInProgress) return;
    reloadInProgress = true;
    renderFull();

    try {
      await GatewayClient.call('config.reload', {});
      await loadConfig();
      showReloadToast('success', t('settings.reloadSuccess') || 'Configuration reloaded successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showReloadToast('error', `${t('settings.reloadError') || 'Reload failed'}: ${msg}`);
    } finally {
      reloadInProgress = false;
      renderFull();
    }
  });
}

/** Show a temporary toast notification for reload results */
function showReloadToast(type: 'success' | 'error', message: string): void {
  // Remove any existing toast
  document.querySelector('#reload-toast')?.remove();

  const bgClass = type === 'success'
    ? 'bg-success/15 border-success/30 text-success'
    : 'bg-error/15 border-error/30 text-error';

  const toast = document.createElement('div');
  toast.id = 'reload-toast';
  toast.className = `fixed bottom-6 right-6 px-5 py-3 rounded-xl border text-sm font-medium shadow-lg z-50
                      ${bgClass} transition-all duration-300`;
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(12px)';
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Auto-remove after 3s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
