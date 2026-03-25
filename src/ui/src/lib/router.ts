/**
 * Simple hash-based SPA router for Rzeclaw UI.
 * Routes map to page components that render into the content area.
 */

import { ensureNamespace } from '../i18n/index.js';
import type { Namespace } from '../i18n/types.js';

export interface Route {
  path: string;
  title: string;
  namespace: Namespace;
  loader: () => Promise<{ render: (container: HTMLElement) => void; cleanup?: () => void }>;
}

// ── Route definitions ──
const routes: Route[] = [
  {
    path: '/',
    title: 'Chat',
    namespace: 'chat',
    loader: () => import('../components/pages/chat-page.js'),
  },
  {
    path: '/office',
    title: 'Office Canvas',
    namespace: 'office',
    loader: () => import('../components/pages/office-page.js'),
  },
  {
    path: '/agent-office',
    title: 'Agent Office',
    namespace: 'office',
    loader: () => import('../components/pages/agent-office-page.js'),
  },
  {
    path: '/agents',
    title: 'Agent Swarm',
    namespace: 'agents',
    loader: () => import('../components/pages/agents-page.js'),
  },
  {
    path: '/flow-editor',
    title: 'Flow Editor',
    namespace: 'flows',
    loader: () => import('../components/pages/flow-editor-page.js'),
  },
  {
    path: '/flow-monitor',
    title: 'Flow Monitor',
    namespace: 'flows',
    loader: () => import('../components/pages/flow-monitor-page.js'),
  },
  {
    path: '/flows-library',
    title: 'Flows & Skills',
    namespace: 'flows',
    loader: () => import('../components/pages/flows-library-page.js'),
  },
  {
    path: '/rag',
    title: 'RAG Nexus',
    namespace: 'rag',
    loader: () => import('../components/pages/rag-page.js'),
  },
  {
    path: '/memory',
    title: 'Memory',
    namespace: 'memory',
    loader: () => import('../components/pages/memory-page.js'),
  },
  {
    path: '/exploration',
    title: 'Exploration',
    namespace: 'explore',
    loader: () => import('../components/pages/exploration-page.js'),
  },
  {
    path: '/evolution',
    title: 'Evolution Log',
    namespace: 'flows',
    loader: () => import('../components/pages/evolution-page.js'),
  },
  {
    path: '/diagnostics',
    title: 'Diagnostics',
    namespace: 'diagnostics',
    loader: () => import('../components/pages/diagnostics-page.js'),
  },
  {
    path: '/security',
    title: 'Security',
    namespace: 'security',
    loader: () => import('../components/pages/security-page.js'),
  },
  {
    path: '/settings',
    title: 'Settings',
    namespace: 'settings',
    loader: () => import('../components/pages/settings-page.js'),
  },
];

// ── State ──
let currentRoute: Route | null = null;
let currentCleanup: (() => void) | undefined;
const routeListeners: Array<(route: Route) => void> = [];

/** Get the current hash path */
function getHashPath(): string {
  const hash = window.location.hash.slice(1); // remove '#'
  return hash || '/';
}

/** Find matching route */
function matchRoute(path: string): Route | undefined {
  return routes.find(r => r.path === path);
}

/** Navigate to a route */
export async function navigateTo(path: string): Promise<void> {
  const route = matchRoute(path);
  if (!route) {
    console.warn(`[Router] No route found for: ${path}`);
    // Fallback to chat
    window.location.hash = '#/';
    return;
  }

  // Cleanup previous page
  if (currentCleanup) {
    try { currentCleanup(); } catch { /* ignore */ }
    currentCleanup = undefined;
  }

  currentRoute = route;

  // Ensure i18n namespace is loaded
  await ensureNamespace(route.namespace);

  // Load and render page
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = '<div class="flex items-center justify-center h-full text-on-surface-variant">Loading…</div>';

  try {
    const mod = await route.loader();
    container.innerHTML = '';
    mod.render(container);
    currentCleanup = mod.cleanup;
  } catch (e) {
    console.error(`[Router] Failed to load page: ${route.path}`, e);
    container.innerHTML = `<div class="flex items-center justify-center h-full text-error">Failed to load page</div>`;
  }

  // Notify listeners
  for (const fn of routeListeners) {
    try { fn(route); } catch { /* ignore */ }
  }
}

/** Subscribe to route changes */
export function onRouteChange(fn: (route: Route) => void): () => void {
  routeListeners.push(fn);
  return () => {
    const idx = routeListeners.indexOf(fn);
    if (idx >= 0) routeListeners.splice(idx, 1);
  };
}

/** Get the current route */
export function getCurrentRoute(): Route | null {
  return currentRoute;
}

/** Get all routes (for sidebar) */
export function getRoutes(): Route[] {
  return [...routes];
}

/** Initialize the router */
export function initRouter(): void {
  // Listen for hash changes
  window.addEventListener('hashchange', () => {
    navigateTo(getHashPath());
  });

  // Navigate to initial route
  navigateTo(getHashPath());
}
