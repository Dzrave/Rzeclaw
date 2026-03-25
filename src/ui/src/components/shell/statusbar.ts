/**
 * StatusBar — Connection status, latency, memory, TPS indicator
 */

import { t } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

export function renderStatusbar(container: HTMLElement): void {
  const state = GatewayClient.getState();
  const latency = GatewayClient.getLatency();

  const statusDot = state === 'connected'
    ? 'bg-success'
    : state === 'connecting' || state === 'reconnecting'
      ? 'bg-warning animate-pulse'
      : 'bg-error';

  container.innerHTML = `
    <div class="flex items-center h-full px-4 gap-6 text-xs font-mono text-on-surface-variant/60">
      <!-- Connection -->
      <div class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
        <span>Gateway</span>
      </div>

      <!-- Latency -->
      <div class="flex items-center gap-1.5">
        <span>${t('common.statusbar.latency')}:</span>
        <span class="${latency > 500 ? 'text-error' : latency > 200 ? 'text-warning' : 'text-success'}">
          ${latency > 0 ? `${latency}ms` : '—'}
        </span>
      </div>

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- App info -->
      <div class="text-on-surface-variant/40">
        Rzeclaw UI v0.1.0
      </div>
    </div>
  `;

  // Update latency display
  GatewayClient.onLatencyChange((ms) => {
    const latencyEl = container.querySelector('[data-latency]') as HTMLElement;
    if (latencyEl) latencyEl.textContent = `${ms}ms`;
  });
}
