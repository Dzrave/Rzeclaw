/**
 * Diagnostics & Health Page — Screen 13
 * Health dashboard, environment info, diagnostic report, self-check terminal
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;
let latencyUnsub: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

interface HealthData {
  gatewayLatency: number;
  heartbeatStatus: 'healthy' | 'degraded' | 'critical';
  memoryThroughput: string;
  toolFailureRate: number;
}

interface EnvironmentInfo {
  platform: string;
  arch?: string;
  hostname?: string;
  nodeVersion: string;
  npmVersion?: string;
  workspace: string;
  uptime: string;
  model: string;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  cpuInfo?: string;
  shell?: string;
  pathSummary?: string;
  enabledModules?: string[];
}

interface DiagnosticReport {
  lastGenerated: string;
  sessions: number;
  memoryEntries: number;
  heartbeats: number;
}

interface TaskQueueItem {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'done';
  submitted: string;
}

interface SelfCheckItem {
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  detail: string;
}

let health: HealthData = {
  gatewayLatency: 0,
  heartbeatStatus: 'healthy',
  memoryThroughput: '—',
  toolFailureRate: 0,
};
let envInfo: EnvironmentInfo = {
  platform: '—',
  nodeVersion: '—',
  workspace: '—',
  uptime: '—',
  model: '—',
};
let report: DiagnosticReport = {
  lastGenerated: '—',
  sessions: 0,
  memoryEntries: 0,
  heartbeats: 0,
};
interface MdnsNode {
  hostname: string;
  ip: string;
  port: number;
  status: 'online' | 'offline';
  lastSeen: string;
}

let selfCheckResults: SelfCheckItem[] = [];
let selfCheckRunning = false;
let taskQueue: TaskQueueItem[] = [];
let mdnsNodes: MdnsNode[] = [];
let mdnsAutoDiscovery = false;

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('diagnostics');
  loadData();

  // Live latency tracking
  health.gatewayLatency = GatewayClient.getLatency();
  latencyUnsub = GatewayClient.onLatencyChange((ms) => {
    health.gatewayLatency = ms;
    updateLatencyDisplay();
  });

  // Periodic refresh
  refreshTimer = setInterval(() => { loadData(); }, 30000);

  renderFull();
}

export function cleanup(): void {
  container = null;
  if (latencyUnsub) { latencyUnsub(); latencyUnsub = null; }
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

async function loadData(): Promise<void> {
  try {
    const [healthRes, reportRes, envRes] = await Promise.allSettled([
      GatewayClient.call<{ health: HealthData; environment: EnvironmentInfo }>('health', {}),
      GatewayClient.call<{ report: DiagnosticReport }>('diagnostic.report', {}),
      GatewayClient.call<{ environment: EnvironmentInfo; taskQueue?: TaskQueueItem[] }>('diagnostic.environment', {}),
    ]);

    if (healthRes.status === 'fulfilled' && healthRes.value) {
      if (healthRes.value.health) {
        health = { ...health, ...healthRes.value.health, gatewayLatency: GatewayClient.getLatency() };
      }
      if (healthRes.value.environment) envInfo = healthRes.value.environment;
    }
    if (reportRes.status === 'fulfilled' && reportRes.value?.report) {
      report = reportRes.value.report;
    }
    if (envRes.status === 'fulfilled' && envRes.value) {
      if (envRes.value.environment) envInfo = envRes.value.environment;
      if (envRes.value.taskQueue) taskQueue = envRes.value.taskQueue;
      if ((envRes.value as Record<string, unknown>).mdnsNodes) mdnsNodes = (envRes.value as Record<string, unknown>).mdnsNodes as MdnsNode[];
      if ((envRes.value as Record<string, unknown>).mdnsAutoDiscovery !== undefined) mdnsAutoDiscovery = !!(envRes.value as Record<string, unknown>).mdnsAutoDiscovery;
    }
    renderFull();
  } catch { /* RPC may not be available */ }
}

function updateLatencyDisplay(): void {
  const el = container?.querySelector('#latency-value');
  if (el) {
    el.textContent = `${health.gatewayLatency}ms`;
  }
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col h-full overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <h1 class="text-xl font-headline font-semibold text-on-surface">
          ${t('diagnostics.title') || 'Diagnostics & Health'}
        </h1>
        <div class="flex items-center gap-2">
          <button id="btn-generate-report" class="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition">
            ${t('diagnostics.report.generate') || 'Generate Report'}
          </button>
          <button id="btn-export-logs" class="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-sm font-medium hover:bg-secondary/20 transition">
            ${t('diagnostics.report.exportLogs') || 'Export Logs'}
          </button>
          <button id="btn-export-metrics" class="px-3 py-1.5 rounded-lg bg-tertiary/10 text-tertiary text-sm font-medium hover:bg-tertiary/20 transition">
            ${t('diagnostics.report.exportMetrics') || 'Export Metrics'}
          </button>
        </div>
      </div>

      <div class="flex-1 p-6 space-y-6">
        <!-- Health Dashboard -->
        <section>
          <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            ${t('diagnostics.health.title') || 'Health Dashboard'}
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${renderHealthCard(
              t('diagnostics.health.gatewayLatency') || 'Gateway Latency',
              `<span id="latency-value">${health.gatewayLatency}ms</span>`,
              health.gatewayLatency < 100 ? 'success' : health.gatewayLatency < 500 ? 'warning' : 'error',
              health.gatewayLatency < 100 ? 'healthy' : health.gatewayLatency < 500 ? 'degraded' : 'critical'
            )}
            ${renderHealthCard(
              t('diagnostics.health.heartbeatStatus') || 'Heartbeat Status',
              health.heartbeatStatus,
              health.heartbeatStatus === 'healthy' ? 'success' : health.heartbeatStatus === 'degraded' ? 'warning' : 'error',
              health.heartbeatStatus
            )}
            ${renderHealthCard(
              t('diagnostics.health.memoryThroughput') || 'Memory R/W Throughput',
              health.memoryThroughput,
              'primary',
              'healthy'
            )}
            ${renderHealthCard(
              t('diagnostics.health.toolFailureRate') || 'Tool Failure Rate',
              `${health.toolFailureRate}%`,
              health.toolFailureRate < 5 ? 'success' : health.toolFailureRate < 20 ? 'warning' : 'error',
              health.toolFailureRate < 5 ? 'healthy' : health.toolFailureRate < 20 ? 'degraded' : 'critical'
            )}
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Environment Info (Enhanced P5-10) -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                ${t('diagnostics.environment.title') || 'Environment Info'}
              </h2>
              <button id="btn-copy-env" class="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition">
                ${t('diagnostics.environment.copyClipboard') || 'Copy to Clipboard'}
              </button>
            </div>
            <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest divide-y divide-outline-variant/10">
              ${renderEnvRow(t('diagnostics.environment.platform') || 'Platform', `${envInfo.platform}${envInfo.arch ? ' / ' + envInfo.arch : ''}`)}
              ${envInfo.hostname ? renderEnvRow(t('diagnostics.environment.hostname') || 'Hostname', envInfo.hostname) : ''}
              ${renderEnvRow(t('diagnostics.environment.nodeVersion') || 'Node Version', envInfo.nodeVersion)}
              ${envInfo.npmVersion ? renderEnvRow(t('diagnostics.environment.npmVersion') || 'npm Version', envInfo.npmVersion) : ''}
              ${renderEnvRow(t('diagnostics.environment.workspace') || 'Workspace', envInfo.workspace)}
              ${renderEnvRow(t('diagnostics.environment.uptime') || 'Uptime', envInfo.uptime)}
              ${renderEnvRow(t('diagnostics.environment.model') || 'Model', envInfo.model)}
              ${envInfo.memoryUsage ? renderEnvRow(
                t('diagnostics.environment.memoryUsage') || 'Memory Usage',
                `${(envInfo.memoryUsage.heapUsed / 1048576).toFixed(1)}MB / ${(envInfo.memoryUsage.heapTotal / 1048576).toFixed(1)}MB (RSS: ${(envInfo.memoryUsage.rss / 1048576).toFixed(1)}MB)`
              ) : ''}
              ${envInfo.cpuInfo ? renderEnvRow(t('diagnostics.environment.cpuInfo') || 'CPU', envInfo.cpuInfo) : ''}
              ${envInfo.shell ? renderEnvRow(t('diagnostics.environment.shell') || 'Shell', envInfo.shell) : ''}
              ${envInfo.enabledModules && envInfo.enabledModules.length > 0 ? renderEnvRow(
                t('diagnostics.environment.enabledModules') || 'Enabled Modules',
                envInfo.enabledModules.join(', ')
              ) : ''}
            </div>
          </section>

          <!-- Diagnostic Report -->
          <section>
            <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
              ${t('diagnostics.report.title') || 'Diagnostic Report'}
            </h2>
            <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs text-on-surface-variant/60">${t('diagnostics.report.lastGenerated') || 'Last Generated'}</span>
                <span class="text-sm text-on-surface font-mono">${report.lastGenerated}</span>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div class="text-center p-3 rounded-lg bg-surface-container">
                  <p class="text-lg font-bold text-primary">${report.sessions}</p>
                  <p class="text-[11px] text-on-surface-variant/60">${t('diagnostics.report.sessions') || 'Sessions'}</p>
                </div>
                <div class="text-center p-3 rounded-lg bg-surface-container">
                  <p class="text-lg font-bold text-secondary">${report.memoryEntries}</p>
                  <p class="text-[11px] text-on-surface-variant/60">${t('diagnostics.report.memoryEntries') || 'Memory Entries'}</p>
                </div>
                <div class="text-center p-3 rounded-lg bg-surface-container">
                  <p class="text-lg font-bold text-tertiary">${report.heartbeats}</p>
                  <p class="text-[11px] text-on-surface-variant/60">${t('diagnostics.report.heartbeats') || 'Heartbeats'}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Task Queue Panel -->
        <section>
          <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            ${t('diagnostics.taskQueue.title') || 'Task Queue'}
          </h2>
          ${taskQueue.length === 0 ? `
            <div class="text-center py-6 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
              ${t('diagnostics.taskQueue.noActiveTasks') || 'No active tasks'}
            </div>
          ` : `
            <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
                    <th class="px-4 py-2.5 font-medium">${t('diagnostics.taskQueue.taskId') || 'Task ID'}</th>
                    <th class="px-4 py-2.5 font-medium">${t('diagnostics.taskQueue.type') || 'Type'}</th>
                    <th class="px-4 py-2.5 font-medium w-28">${t('diagnostics.taskQueue.status') || 'Status'}</th>
                    <th class="px-4 py-2.5 font-medium">${t('diagnostics.taskQueue.submitted') || 'Submitted'}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10">
                  ${taskQueue.map(renderTaskRow).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>

        <!-- mDNS Discovery Monitoring -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
              ${t('diagnostics.mdns.title') || 'mDNS Discovery'}
            </h2>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <span class="text-xs text-on-surface-variant/60">${t('diagnostics.mdns.autoDiscovery') || 'Auto-Discovery'}</span>
                <div class="relative inline-flex items-center">
                  <input type="checkbox" id="mdns-auto-toggle" class="sr-only peer" ${mdnsAutoDiscovery ? 'checked' : ''} />
                  <div class="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </div>
                <span class="text-[11px] ${mdnsAutoDiscovery ? 'text-success' : 'text-on-surface-variant/50'}">
                  ${mdnsAutoDiscovery ? (t('diagnostics.mdns.enabled') || 'Enabled') : (t('diagnostics.mdns.disabled') || 'Disabled')}
                </span>
              </label>
              <button id="btn-refresh-mdns" class="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition">
                ${t('diagnostics.mdns.refresh') || 'Refresh'}
              </button>
            </div>
          </div>
          ${mdnsNodes.length === 0 ? `
            <div class="text-center py-6 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
              ${t('diagnostics.mdns.noNodes') || 'No mDNS nodes discovered yet.'}
            </div>
          ` : `
            <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
                    <th class="px-4 py-2.5 font-medium w-8"></th>
                    <th class="px-4 py-2.5 font-medium">${t('diagnostics.mdns.hostname') || 'Hostname'}</th>
                    <th class="px-4 py-2.5 font-medium">${t('diagnostics.mdns.ip') || 'IP Address'}</th>
                    <th class="px-4 py-2.5 font-medium w-20">${t('diagnostics.mdns.port') || 'Port'}</th>
                    <th class="px-4 py-2.5 font-medium w-24">${t('diagnostics.mdns.status') || 'Status'}</th>
                    <th class="px-4 py-2.5 font-medium">${t('diagnostics.mdns.lastSeen') || 'Last Seen'}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10">
                  ${mdnsNodes.map(renderMdnsNode).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>

        <!-- Self-Check Terminal -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
              ${t('diagnostics.selfCheck.title') || 'Self-Check Terminal'}
            </h2>
            <button id="btn-run-selfcheck" class="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition
                           ${selfCheckRunning ? 'opacity-50 pointer-events-none' : ''}">
              ${selfCheckRunning ? t('diagnostics.selfCheck.running') || 'Running...' : 'Run Self-Check'}
            </button>
          </div>
          <div id="selfcheck-terminal" class="rounded-xl border border-outline-variant/20 bg-[#0d1117] p-4 font-mono text-xs min-h-[160px] max-h-[300px] overflow-y-auto">
            ${selfCheckResults.length === 0 ? `
              <p class="text-on-surface-variant/40">$ awaiting self-check...</p>
            ` : `
              <p class="text-on-surface-variant/50 mb-2">$ rezbot self-check --all</p>
              ${selfCheckResults.map(renderSelfCheckLine).join('')}
              <p class="text-on-surface-variant/50 mt-2">$ ${t('diagnostics.selfCheck.complete') || 'Self-check complete'}</p>
            `}
          </div>
        </section>
      </div>
    </div>
  `;

  bindEvents();
}

function renderHealthCard(label: string, value: string, color: string, statusKey: string): string {
  const statusLabel = t(`diagnostics.health.${statusKey}`) || statusKey;
  const statusColors: Record<string, string> = {
    healthy: 'bg-success/15 text-success',
    degraded: 'bg-warning/15 text-warning',
    critical: 'bg-error/15 text-error',
  };

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs text-on-surface-variant/60">${label}</p>
        <span class="w-2 h-2 rounded-full bg-${color}"></span>
      </div>
      <p class="text-xl font-headline font-bold text-${color} mb-1">${value}</p>
      <span class="text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[statusKey] || 'bg-surface-container-high text-on-surface-variant'}">${statusLabel}</span>
    </div>
  `;
}

function renderEnvRow(label: string, value: string): string {
  return `
    <div class="flex items-center justify-between px-4 py-2.5">
      <span class="text-xs text-on-surface-variant/60">${label}</span>
      <span class="text-sm text-on-surface font-mono">${escHtml(value)}</span>
    </div>
  `;
}

function renderTaskRow(task: TaskQueueItem): string {
  const statusColors: Record<string, string> = {
    pending: 'bg-warning/15 text-warning',
    running: 'bg-primary/15 text-primary',
    done: 'bg-success/15 text-success',
  };
  const statusLabel = t(`diagnostics.taskQueue.${task.status}`) || task.status;
  const truncatedId = task.id.length > 12 ? task.id.substring(0, 12) + '...' : task.id;

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface" title="${escHtml(task.id)}">${escHtml(truncatedId)}</td>
      <td class="px-4 py-2.5 text-on-surface-variant text-xs">${escHtml(task.type)}</td>
      <td class="px-4 py-2.5">
        <span class="px-2 py-0.5 rounded-full text-[11px] ${statusColors[task.status] || ''}">${statusLabel}</span>
      </td>
      <td class="px-4 py-2.5 text-on-surface-variant text-[11px] font-mono">${escHtml(task.submitted)}</td>
    </tr>
  `;
}

function renderSelfCheckLine(item: SelfCheckItem): string {
  const colorMap: Record<string, string> = {
    pass: 'text-green-400',
    warn: 'text-yellow-400',
    fail: 'text-red-400',
    info: 'text-blue-400',
  };
  const tagText = `[${(t(`diagnostics.selfCheck.${item.status}`) || item.status).toUpperCase()}]`;

  return `
    <div class="flex gap-2 py-0.5">
      <span class="${colorMap[item.status]} w-14 shrink-0">${tagText}</span>
      <span class="text-gray-300">${escHtml(item.label)}</span>
      <span class="text-gray-500 ml-auto">${escHtml(item.detail)}</span>
    </div>
  `;
}

function renderMdnsNode(node: MdnsNode): string {
  const isOnline = node.status === 'online';
  const statusColor = isOnline ? 'bg-success' : 'bg-on-surface-variant/30';
  const statusBadge = isOnline ? 'bg-success/15 text-success' : 'bg-surface-container-high text-on-surface-variant/50';
  const statusLabel = isOnline
    ? (t('diagnostics.mdns.online') || 'Online')
    : (t('diagnostics.mdns.offline') || 'Offline');

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5">
        <span class="w-2.5 h-2.5 rounded-full ${statusColor} inline-block"></span>
      </td>
      <td class="px-4 py-2.5 text-on-surface text-xs font-medium">${escHtml(node.hostname)}</td>
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface">${escHtml(node.ip)}</td>
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface-variant">${node.port}</td>
      <td class="px-4 py-2.5">
        <span class="px-2 py-0.5 rounded-full text-[11px] ${statusBadge}">${statusLabel}</span>
      </td>
      <td class="px-4 py-2.5 text-on-surface-variant text-[11px] font-mono">${escHtml(node.lastSeen)}</td>
    </tr>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindEvents(): void {
  if (!container) return;

  // Copy environment info to clipboard (P5-10)
  container.querySelector('#btn-copy-env')?.addEventListener('click', () => {
    const lines = [
      `Platform: ${envInfo.platform}${envInfo.arch ? ' / ' + envInfo.arch : ''}`,
      envInfo.hostname ? `Hostname: ${envInfo.hostname}` : '',
      `Node: ${envInfo.nodeVersion}`,
      envInfo.npmVersion ? `npm: ${envInfo.npmVersion}` : '',
      `Workspace: ${envInfo.workspace}`,
      `Uptime: ${envInfo.uptime}`,
      `Model: ${envInfo.model}`,
      envInfo.memoryUsage ? `Memory: ${(envInfo.memoryUsage.heapUsed / 1048576).toFixed(1)}MB / ${(envInfo.memoryUsage.heapTotal / 1048576).toFixed(1)}MB (RSS: ${(envInfo.memoryUsage.rss / 1048576).toFixed(1)}MB)` : '',
      envInfo.cpuInfo ? `CPU: ${envInfo.cpuInfo}` : '',
      envInfo.shell ? `Shell: ${envInfo.shell}` : '',
      envInfo.enabledModules?.length ? `Modules: ${envInfo.enabledModules.join(', ')}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      const btn = container?.querySelector('#btn-copy-env');
      if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = t('diagnostics.environment.copyClipboard') || 'Copy to Clipboard'; }, 2000); }
    });
  });

  container.querySelector('#btn-generate-report')?.addEventListener('click', async () => {
    try {
      await GatewayClient.call('diagnostic.generate', {});
      await loadData();
    } catch (e) {
      console.error('Generate report failed:', e);
    }
  });

  container.querySelector('#btn-export-logs')?.addEventListener('click', async () => {
    try {
      const result = await GatewayClient.call<{ data: string; filename: string }>('diagnostic.export', {});
      if (result?.data) {
        downloadFile(result.data, result.filename || 'rezbot-logs.jsonl', 'application/x-ndjson');
      }
    } catch (e) {
      console.error('Export logs failed:', e);
    }
  });

  container.querySelector('#btn-export-metrics')?.addEventListener('click', () => {
    try {
      const metricsData = {
        exportedAt: new Date().toISOString(),
        health: {
          gatewayLatency: health.gatewayLatency,
          heartbeatStatus: health.heartbeatStatus,
          memoryThroughput: health.memoryThroughput,
          toolFailureRate: health.toolFailureRate,
        },
        environment: { ...envInfo },
        report: { ...report },
        taskQueue: taskQueue.map(t => ({ ...t })),
      };
      const json = JSON.stringify(metricsData, null, 2);
      downloadFile(json, `rezbot-metrics-${Date.now()}.json`, 'application/json');
    } catch (e) {
      console.error('Export metrics failed:', e);
    }
  });

  container.querySelector('#btn-run-selfcheck')?.addEventListener('click', async () => {
    selfCheckRunning = true;
    selfCheckResults = [];
    renderFull();

    const checks = [
      { label: t('diagnostics.selfCheck.gatewayConnection') || 'Gateway connection', rpc: 'health' },
      { label: t('diagnostics.selfCheck.memoryAccess') || 'Memory read/write access', rpc: 'memory.check' },
      { label: t('diagnostics.selfCheck.toolRegistry') || 'Tool registry', rpc: 'tools.list' },
      { label: t('diagnostics.selfCheck.heartbeatService') || 'Heartbeat service', rpc: 'heartbeat.status' },
      { label: t('diagnostics.selfCheck.configValidation') || 'Config validation', rpc: 'config.validate' },
      { label: t('diagnostics.selfCheck.diskSpace') || 'Disk space', rpc: 'diagnostic.diskSpace' },
    ];

    for (const check of checks) {
      try {
        const start = Date.now();
        await GatewayClient.call(check.rpc, {});
        const elapsed = Date.now() - start;
        selfCheckResults.push({
          label: check.label,
          status: elapsed < 500 ? 'pass' : 'warn',
          detail: `${elapsed}ms`,
        });
      } catch (e) {
        selfCheckResults.push({
          label: check.label,
          status: 'fail',
          detail: e instanceof Error ? e.message : 'error',
        });
      }
      renderFull();
    }

    selfCheckRunning = false;
    renderFull();
  });

  // mDNS Discovery events
  container.querySelector('#mdns-auto-toggle')?.addEventListener('change', async (e) => {
    mdnsAutoDiscovery = (e.target as HTMLInputElement).checked;
    try {
      await GatewayClient.call('diagnostic.mdns.setAutoDiscovery', { enabled: mdnsAutoDiscovery });
    } catch { /* best effort */ }
    renderFull();
  });

  container.querySelector('#btn-refresh-mdns')?.addEventListener('click', async () => {
    try {
      const result = await GatewayClient.call<{ nodes?: MdnsNode[] }>('diagnostic.environment', {});
      if ((result as Record<string, unknown>)?.mdnsNodes) {
        mdnsNodes = (result as Record<string, unknown>).mdnsNodes as MdnsNode[];
      }
    } catch { /* best effort */ }
    renderFull();
  });
}

function downloadFile(data: string, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
