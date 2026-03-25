/**
 * Unified Sidebar Navigation — AD-02 implementation
 * 5 nav groups, 14 items, brand header
 */

import { t } from '../../i18n/index.js';
import { onRouteChange, getCurrentRoute } from '../../lib/router.js';

interface NavItem {
  key: string;
  path: string;
  icon: string;
}

interface NavGroup {
  key: string;
  items: NavItem[];
}

const NAV_STRUCTURE: NavGroup[] = [
  {
    key: 'nav.workspace',
    items: [
      { key: 'nav.chat', path: '/', icon: 'terminal' },
      { key: 'nav.office', path: '/office', icon: 'grid' },
      { key: 'nav.agentOffice', path: '/agent-office', icon: 'building' },
    ],
  },
  {
    key: 'nav.agentsFlows',
    items: [
      { key: 'nav.agentSwarm', path: '/agents', icon: 'users' },
      { key: 'nav.flowEditor', path: '/flow-editor', icon: 'workflow' },
      { key: 'nav.flowMonitor', path: '/flow-monitor', icon: 'activity' },
      { key: 'nav.flowsLibrary', path: '/flows-library', icon: 'library' },
    ],
  },
  {
    key: 'nav.knowledgeMemory',
    items: [
      { key: 'nav.ragNexus', path: '/rag', icon: 'database' },
      { key: 'nav.memory', path: '/memory', icon: 'brain' },
    ],
  },
  {
    key: 'nav.analyticsLogs',
    items: [
      { key: 'nav.exploration', path: '/exploration', icon: 'compass' },
      { key: 'nav.evolutionLog', path: '/evolution', icon: 'gitBranch' },
      { key: 'nav.diagnostics', path: '/diagnostics', icon: 'heartPulse' },
    ],
  },
  {
    key: 'nav.system',
    items: [
      { key: 'nav.security', path: '/security', icon: 'shield' },
      { key: 'nav.settings', path: '/settings', icon: 'settings' },
    ],
  },
];

const ICONS: Record<string, string> = {
  terminal: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  grid: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  building: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>`,
  users: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  workflow: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M6 9v3a1 1 0 0 0 1 1h4"/><path d="M18 9v3a1 1 0 0 1-1 1h-4"/></svg>`,
  activity: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  library: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  database: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>`,
  brain: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3 3 3 0 0 1-1 5.83V17a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-1.17A3 3 0 0 1 5 10a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z"/><path d="M12 2v20"/></svg>`,
  compass: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  gitBranch: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  heartPulse: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>`,
  shield: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  settings: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

function getIcon(name: string): string {
  return ICONS[name] ?? '';
}

export function renderSidebar(container: HTMLElement): void {
  const currentPath = getCurrentRoute()?.path ?? '/';

  let html = `
    <!-- Brand Header -->
    <div class="px-5 py-5 border-b border-outline-variant/20">
      <div class="font-display font-bold text-lg text-primary tracking-wide">
        ${t('common.app.name')}
      </div>
      <div class="font-label text-xs text-on-surface-variant tracking-widest uppercase mt-0.5">
        ${t('common.app.subtitle')}
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-3 px-3 space-y-4">
  `;

  for (const group of NAV_STRUCTURE) {
    html += `
      <div>
        <div class="px-2 mb-1.5 text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
          ${t(`common.${group.key}`)}
        </div>
        <ul class="space-y-0.5">
    `;

    for (const item of group.items) {
      const isActive = item.path === currentPath;
      const activeClass = isActive
        ? 'bg-primary/12 text-primary font-medium'
        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';

      html += `
        <li>
          <a href="#${item.path}"
             class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${activeClass}"
             data-route="${item.path}">
            <span class="shrink-0 opacity-80">${getIcon(item.icon)}</span>
            <span class="truncate">${t(`common.${item.key}`)}</span>
            ${isActive ? '<span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary"></span>' : ''}
          </a>
        </li>
      `;
    }

    html += `</ul></div>`;
  }

  html += `</nav>`;

  // Version footer
  html += `
    <div class="px-5 py-3 border-t border-outline-variant/20 text-xs text-on-surface-variant/40 font-mono">
      v0.1.0
    </div>
  `;

  container.innerHTML = html;

  // Subscribe to route changes to update active state
  onRouteChange(() => {
    renderSidebar(container);
  });
}
