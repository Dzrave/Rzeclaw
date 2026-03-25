/**
 * AppShell — Main application layout component
 * Sidebar (w-64) + TopNav (h-16) + Content + StatusBar (h-8)
 */

import { t, onLocaleChange } from '../../i18n/index.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar } from './topbar.js';
import { renderStatusbar } from './statusbar.js';

export function renderApp(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="flex h-screen w-screen overflow-hidden">
      <!-- Sidebar -->
      <aside id="sidebar" class="flex flex-col w-64 h-full bg-surface-container-lowest shrink-0 border-r border-outline-variant/30 transition-all duration-300">
      </aside>

      <!-- Main Area -->
      <div class="flex flex-col flex-1 min-w-0">
        <!-- Top Bar -->
        <header id="topbar" class="h-16 shrink-0 bg-surface-container-low border-b border-outline-variant/30">
        </header>

        <!-- Page Content -->
        <main id="page-content" class="flex-1 overflow-auto bg-surface">
        </main>

        <!-- Status Bar -->
        <footer id="statusbar" class="h-8 shrink-0 bg-surface-container-lowest border-t border-outline-variant/30">
        </footer>
      </div>
    </div>
  `;

  // Render sub-components
  renderSidebar(document.getElementById('sidebar')!);
  renderTopbar(document.getElementById('topbar')!);
  renderStatusbar(document.getElementById('statusbar')!);

  // Re-render on locale change
  onLocaleChange(() => {
    renderSidebar(document.getElementById('sidebar')!);
    renderTopbar(document.getElementById('topbar')!);
    renderStatusbar(document.getElementById('statusbar')!);
  });
}
