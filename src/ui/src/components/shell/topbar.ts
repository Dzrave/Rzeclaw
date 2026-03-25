/**
 * TopBar — Breadcrumb + Search + Language Switcher + Connection Status
 */

import { t, getLocale, setLocale, getSupportedLocales, getLocaleDisplayName } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';
import { onRouteChange, getCurrentRoute } from '../../lib/router.js';

export function renderTopbar(container: HTMLElement): void {
  const currentRoute = getCurrentRoute();
  const locale = getLocale();
  const state = GatewayClient.getState();

  const statusDot = state === 'connected'
    ? 'bg-success'
    : state === 'connecting' || state === 'reconnecting'
      ? 'bg-warning animate-pulse'
      : 'bg-error';
  const statusText = t(`common.status.${state}`);

  container.innerHTML = `
    <div class="flex items-center h-full px-5 gap-4">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm flex-1 min-w-0">
        <span class="text-on-surface-variant/60 font-label">${t('common.app.name')}</span>
        <span class="text-outline-variant">/</span>
        <span class="text-on-surface font-medium truncate">${currentRoute?.title ?? 'Chat'}</span>
      </div>

      <!-- Search (placeholder) -->
      <div class="relative hidden md:block">
        <input type="text"
               placeholder="${t('common.action.search')}… (⌘K)"
               class="w-56 h-8 pl-8 pr-3 rounded-lg bg-surface-container text-sm text-on-surface
                      border border-outline-variant/30 placeholder:text-on-surface-variant/40
                      focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none transition" />
        <svg class="absolute left-2.5 top-2 w-4 h-4 text-on-surface-variant/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
      </div>

      <!-- Language Switcher -->
      <div class="relative">
        <button id="locale-btn"
                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-label
                       bg-surface-container hover:bg-surface-container-high text-on-surface-variant
                       border border-outline-variant/30 transition">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span>${getLocaleDisplayName(locale)}</span>
        </button>
        <div id="locale-dropdown"
             class="hidden absolute right-0 top-full mt-1 w-36 bg-surface-container-high rounded-lg shadow-lg
                    border border-outline-variant/30 py-1 z-50">
          ${getSupportedLocales().map(l => `
            <button class="locale-option w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10 transition
                           ${l === locale ? 'text-primary font-medium' : 'text-on-surface-variant'}"
                    data-locale="${l}">
              ${getLocaleDisplayName(l)}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Connection Status -->
      <div class="flex items-center gap-2 text-xs text-on-surface-variant">
        <span class="w-2 h-2 rounded-full ${statusDot}"></span>
        <span>${statusText}</span>
      </div>
    </div>
  `;

  // Event: toggle locale dropdown
  const btn = container.querySelector('#locale-btn') as HTMLButtonElement;
  const dropdown = container.querySelector('#locale-dropdown') as HTMLElement;

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  // Event: select locale
  container.querySelectorAll('.locale-option').forEach(el => {
    el.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLElement;
      const locale = target.dataset.locale;
      if (locale) {
        await setLocale(locale as 'zh-CN' | 'en' | 'ja');
      }
      dropdown.classList.add('hidden');
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
  });

  // Update on route change
  onRouteChange(() => {
    renderTopbar(container);
  });

  // Update on connection state change
  GatewayClient.onStateChange(() => {
    renderTopbar(container);
  });
}
