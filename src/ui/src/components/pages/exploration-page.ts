/**
 * Exploration & Strategy Page — Screen 06
 * Gatekeeper detectors, Planner/Critic workflow, Experience repository
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;

interface TriggerEvent {
  detectorName: string;
  value: number;
  threshold: number;
  timestamp: string;
}

interface GatekeeperDetector {
  name: string;
  threshold: number;
  current: number;
  triggered: boolean;
}

interface WorkflowNode {
  id: string;
  label: string;
  status: 'waiting' | 'active' | 'complete' | 'failed';
  strategyOutput?: Record<string, unknown>;
  params?: string;
}

interface ExperienceEntry {
  id: string;
  outcome: 'success' | 'failure';
  strategy: string;
  insight: string;
  timestamp: string;
}

interface DiscoveredNode {
  hostname: string;
  ip: string;
  port: number;
  status: 'online' | 'offline';
  lastSeen: string;
}

let detectors: GatekeeperDetector[] = [
  { name: 'novelty', threshold: 0.7, current: 0, triggered: false },
  { name: 'complexity', threshold: 0.8, current: 0, triggered: false },
  { name: 'ambiguity', threshold: 0.6, current: 0, triggered: false },
];
let triggerHistory: TriggerEvent[] = [];
let workflowNodes: WorkflowNode[] = [
  { id: 'detect', label: 'Detect', status: 'waiting' },
  { id: 'plan', label: 'Plan', status: 'waiting' },
  { id: 'critique', label: 'Critique', status: 'waiting' },
];
let expandedWorkflowNode: string | null = null;
let experiences: ExperienceEntry[] = [];
let experienceFilter: 'all' | 'success' | 'failure' = 'all';
let experienceSearch = '';
let experienceDetailId: string | null = null;
let editingThreshold: string | null = null;
let discoveredNodes: DiscoveredNode[] = [];
let discoveryScanning = false;
let explorationActive = false;

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('explore');
  loadStatus();
  renderFull();
}

export function cleanup(): void {
  container = null;
}

async function loadStatus(): Promise<void> {
  try {
    const result = await GatewayClient.call<{
      detectors?: GatekeeperDetector[];
      workflow?: WorkflowNode[];
      experiences?: ExperienceEntry[];
      active?: boolean;
      triggerHistory?: TriggerEvent[];
    }>('exploration.status', {});
    if (result?.detectors) detectors = result.detectors;
    if (result?.workflow) workflowNodes = result.workflow;
    if (result?.experiences) experiences = result.experiences;
    if (result?.active !== undefined) explorationActive = result.active;
    if (result?.triggerHistory) triggerHistory = result.triggerHistory;
    renderFull();
  } catch { /* RPC may not be available */ }
}

function renderFull(): void {
  if (!container) return;

  const filteredExperiences = experiences.filter(exp => {
    if (experienceFilter !== 'all' && exp.outcome !== experienceFilter) return false;
    if (experienceSearch) {
      const q = experienceSearch.toLowerCase();
      return exp.strategy.toLowerCase().includes(q) || exp.insight.toLowerCase().includes(q);
    }
    return true;
  });

  container.innerHTML = `
    <div class="flex flex-col h-full overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <div>
          <h1 class="text-xl font-headline font-semibold text-on-surface">
            ${t('explore.title') || 'Exploration & Strategy'}
          </h1>
          <p class="text-xs text-on-surface-variant/60 mt-0.5">
            ${explorationActive ? t('explore.status.exploring') || 'Exploring' : t('explore.status.idle') || 'Idle'}
          </p>
        </div>
        <button id="btn-initiate" class="px-5 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2
                       ${explorationActive
                         ? 'bg-error/15 text-error hover:bg-error/25 border border-error/30'
                         : 'bg-primary text-on-primary hover:bg-primary/90'}">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          ${explorationActive ? 'STOP PROTOCOL' : t('explore.initiateProtocol') || 'INITIATE PROTOCOL'}
        </button>
      </div>

      <div class="flex-1 p-6 space-y-6">
        <!-- Gatekeeper Section -->
        <section>
          <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            ${t('explore.gatekeeper.title') || 'Gatekeeper'}
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${detectors.map(renderDetectorCard).join('')}
          </div>
          <!-- Trigger History -->
          <div class="mt-4">
            <h3 class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              ${t('explore.gatekeeper.triggerHistory') || 'Trigger History'}
            </h3>
            ${triggerHistory.length === 0 ? `
              <div class="text-xs text-on-surface-variant/50 py-3 px-4 rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
                ${t('explore.gatekeeper.noTriggers') || 'No trigger events recorded.'}
              </div>
            ` : `
              <div class="space-y-1 max-h-40 overflow-y-auto">
                ${triggerHistory.map(ev => `
                  <div class="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline-variant/15 bg-surface-container-lowest text-xs">
                    <span class="w-2 h-2 rounded-full bg-warning shrink-0"></span>
                    <span class="font-medium text-on-surface">${escHtml(ev.detectorName)}</span>
                    <span class="text-on-surface-variant/60">${t('explore.gatekeeper.value') || 'Value'}: ${ev.value.toFixed(2)} / ${ev.threshold.toFixed(2)}</span>
                    <span class="ml-auto text-on-surface-variant/50 font-mono text-[11px]">${escHtml(ev.timestamp)}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </section>

        <!-- Planner/Critic Workflow -->
        <section>
          <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            ${t('explore.workflow.title') || 'Planner / Critic Workflow'}
          </h2>
          <div class="flex items-center justify-center py-6">
            ${renderWorkflowDiagram()}
          </div>
          <!-- Expandable detail panels -->
          <div class="space-y-2 mt-2">
            ${workflowNodes.map(renderWorkflowDetail).join('')}
          </div>
        </section>

        <!-- Experience Repository -->
        <section>
          <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            ${t('explore.experience.title') || 'Experience Repository'}
          </h2>
          <!-- Search and Filter -->
          <div class="flex items-center gap-3 mb-3">
            <input id="experience-search" type="text"
                   class="flex-1 px-3 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                          border border-outline-variant/30 focus:border-primary outline-none"
                   placeholder="${t('explore.experience.search') || 'Search experiences...'}"
                   value="${escHtml(experienceSearch)}" />
            <div class="flex items-center gap-1">
              <button class="exp-filter-btn px-2.5 py-1 rounded-md text-xs font-medium transition
                             ${experienceFilter === 'all' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}"
                      data-filter="all">${t('explore.experience.filterAll') || 'All'}</button>
              <button class="exp-filter-btn px-2.5 py-1 rounded-md text-xs font-medium transition
                             ${experienceFilter === 'success' ? 'bg-success/15 text-success' : 'text-on-surface-variant hover:bg-surface-container-high'}"
                      data-filter="success">${t('explore.experience.filterSuccess') || 'Success'}</button>
              <button class="exp-filter-btn px-2.5 py-1 rounded-md text-xs font-medium transition
                             ${experienceFilter === 'failure' ? 'bg-error/15 text-error' : 'text-on-surface-variant hover:bg-surface-container-high'}"
                      data-filter="failure">${t('explore.experience.filterFailure') || 'Failure'}</button>
            </div>
          </div>
          ${filteredExperiences.length === 0 ? `
            <div class="text-center py-8 text-on-surface-variant/50 text-sm">
              ${t('explore.experience.empty') || 'No exploration outcomes recorded yet.'}
            </div>
          ` : `
            <div class="space-y-2">
              ${filteredExperiences.map(renderExperienceCard).join('')}
            </div>
          `}
        </section>

        <!-- Network Discovery (mDNS) -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
              ${t('explore.discovery.title') || 'Network Discovery'}
            </h2>
            <div class="flex items-center gap-3">
              ${discoveredNodes.length > 0 ? `
                <span class="text-xs text-on-surface-variant/60">${discoveredNodes.length} ${t('explore.discovery.nodesFound') || 'nodes found'}</span>
              ` : ''}
              <button id="btn-scan-network" class="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition
                             ${discoveryScanning ? 'opacity-50 pointer-events-none' : ''}">
                <span class="flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 ${discoveryScanning ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12a3 3 0 116 0 3 3 0 01-6 0z" />
                  </svg>
                  ${discoveryScanning ? t('explore.discovery.scanning') || 'Scanning...' : t('explore.discovery.scan') || 'Scan Network'}
                </span>
              </button>
            </div>
          </div>
          ${discoveredNodes.length === 0 ? `
            <div class="text-center py-8 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
              ${t('explore.discovery.empty') || 'No nodes discovered yet. Click Scan Network to begin.'}
            </div>
          ` : `
            <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
                    <th class="px-4 py-2.5 font-medium">${t('explore.discovery.hostname') || 'Hostname'}</th>
                    <th class="px-4 py-2.5 font-medium">${t('explore.discovery.ip') || 'IP Address'}</th>
                    <th class="px-4 py-2.5 font-medium w-20">${t('explore.discovery.port') || 'Port'}</th>
                    <th class="px-4 py-2.5 font-medium w-24">${t('explore.discovery.status') || 'Status'}</th>
                    <th class="px-4 py-2.5 font-medium">${t('explore.discovery.lastSeen') || 'Last Seen'}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10">
                  ${discoveredNodes.map(renderDiscoveredNode).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>
      </div>
    </div>

    <!-- Experience Detail Modal -->
    ${experienceDetailId ? renderExperienceModal() : ''}
  `;

  bindEvents();
}

function renderDetectorCard(d: GatekeeperDetector): string {
  const pct = Math.round((d.current / d.threshold) * 100);
  const barColor = d.triggered ? 'bg-warning' : 'bg-primary';
  const labelKey = `explore.gatekeeper.${d.name}` as const;
  const isEditing = editingThreshold === d.name;

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-on-surface">${t(labelKey) || d.name}</h3>
        <span class="text-xs px-2 py-0.5 rounded-full ${d.triggered
          ? 'bg-warning/15 text-warning'
          : 'bg-surface-container-high text-on-surface-variant'}">
          ${d.triggered ? t('explore.gatekeeper.triggered') || 'Triggered' : t('explore.gatekeeper.idle') || 'Idle'}
        </span>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <div class="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden threshold-bar cursor-pointer" data-detector="${d.name}" title="${t('explore.gatekeeper.editThreshold') || 'Edit Threshold'}">
          <div class="h-full rounded-full ${barColor} transition-all" style="width: ${Math.min(pct, 100)}%"></div>
        </div>
        <span class="text-xs text-on-surface-variant w-10 text-right">${Math.min(pct, 100)}%</span>
      </div>
      <div class="flex justify-between text-[11px] text-on-surface-variant/60">
        <span>${t('explore.gatekeeper.current') || 'Current'}: ${d.current.toFixed(2)}</span>
        ${isEditing ? `
          <span class="flex items-center gap-1">
            ${t('explore.gatekeeper.threshold') || 'Threshold'}:
            <input type="number" step="0.01" min="0" max="1"
                   class="threshold-input w-16 px-1 py-0.5 rounded bg-surface-container-high text-on-surface text-[11px] font-mono
                          border border-primary/50 focus:border-primary outline-none"
                   data-detector="${d.name}" value="${d.threshold.toFixed(2)}" />
            <button class="threshold-save px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] hover:bg-primary/25" data-detector="${d.name}">OK</button>
          </span>
        ` : `
          <span>${t('explore.gatekeeper.threshold') || 'Threshold'}: ${d.threshold.toFixed(2)}</span>
        `}
      </div>
    </div>
  `;
}

function renderWorkflowDiagram(): string {
  const nodes = workflowNodes.map((node, idx) => {
    const colors: Record<string, string> = {
      waiting: 'border-outline-variant/40 bg-surface-container text-on-surface-variant',
      active: 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30',
      complete: 'border-success bg-success/10 text-success',
      failed: 'border-error bg-error/10 text-error',
    };
    const icons: Record<string, string> = {
      waiting: '',
      active: '<span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-pulse"></span>',
      complete: '<span class="absolute -top-1 -right-1 text-success text-sm">&#10003;</span>',
      failed: '<span class="absolute -top-1 -right-1 text-error text-sm">&#10007;</span>',
    };

    const labelKey = `explore.workflow.${node.id}`;
    const isExpanded = expandedWorkflowNode === node.id;
    const nodeHtml = `
      <div class="relative flex flex-col items-center">
        ${icons[node.status]}
        <div class="w-20 h-20 rounded-2xl border-2 ${colors[node.status]} flex items-center justify-center transition-all cursor-pointer workflow-node-btn ${isExpanded ? 'ring-2 ring-primary/40' : ''}" data-node="${node.id}">
          <span class="text-sm font-semibold">${t(labelKey) || node.label}</span>
        </div>
        <span class="text-[10px] mt-1.5 text-on-surface-variant/60">${t(`explore.workflow.status.${node.status}`) || node.status}</span>
      </div>
    `;

    const arrow = idx < workflowNodes.length - 1 ? `
      <div class="flex items-center px-3">
        <svg class="w-8 h-4 text-outline-variant/40" viewBox="0 0 32 16">
          <line x1="0" y1="8" x2="26" y2="8" stroke="currentColor" stroke-width="2" />
          <polygon points="26,3 32,8 26,13" fill="currentColor" />
        </svg>
      </div>
    ` : '';

    return nodeHtml + arrow;
  });

  return `<div class="flex items-start">${nodes.join('')}</div>`;
}

function renderWorkflowDetail(node: WorkflowNode): string {
  const isExpanded = expandedWorkflowNode === node.id;
  if (!isExpanded) return '';

  const outputJson = node.strategyOutput
    ? JSON.stringify(node.strategyOutput, null, 2)
    : '';

  return `
    <div class="rounded-xl border border-primary/20 bg-surface-container-lowest p-4 animate-in">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-on-surface">
          ${t(`explore.workflow.${node.id}`) || node.label} - ${t('explore.workflow.details') || 'Details'}
        </h4>
        <button class="workflow-collapse-btn text-xs text-on-surface-variant hover:text-on-surface" data-node="${node.id}">&#10005;</button>
      </div>

      <!-- Strategy Output -->
      <div class="mb-3">
        <p class="text-xs text-on-surface-variant/60 mb-1">${t('explore.workflow.strategyOutput') || 'Strategy Output'}</p>
        ${outputJson ? `
          <pre class="text-xs font-mono text-on-surface bg-[#0d1117] rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">${escHtml(outputJson)}</pre>
        ` : `
          <p class="text-xs text-on-surface-variant/50 italic">${t('explore.workflow.noOutput') || 'No output available.'}</p>
        `}
      </div>

      <!-- Strategy Params Editor -->
      <div>
        <p class="text-xs text-on-surface-variant/60 mb-1">${t('explore.workflow.editParams') || 'Edit Parameters'}</p>
        <textarea id="workflow-params-${node.id}"
                  class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-xs text-on-surface font-mono
                         border border-outline-variant/30 focus:border-primary outline-none resize-y min-h-[80px]"
                  placeholder="${t('explore.workflow.paramsPlaceholder') || 'Enter strategy parameters as JSON...'}">${escHtml(node.params || '')}</textarea>
        <button class="workflow-apply-params mt-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition" data-node="${node.id}">
          ${t('explore.workflow.applyParams') || 'Apply'}
        </button>
      </div>
    </div>
  `;
}

function renderExperienceCard(exp: ExperienceEntry): string {
  const borderColor = exp.outcome === 'success' ? 'border-l-success' : 'border-l-error';
  const outcomeLabel = exp.outcome === 'success'
    ? (t('explore.experience.success') || 'Success')
    : (t('explore.experience.failure') || 'Failure');
  const outcomeBadge = exp.outcome === 'success'
    ? 'bg-success/15 text-success'
    : 'bg-error/15 text-error';

  return `
    <div class="rounded-lg border border-outline-variant/20 border-l-4 ${borderColor} bg-surface-container-lowest p-4 cursor-pointer hover:bg-surface-container/50 transition experience-card" data-id="${exp.id}">
      <div class="flex items-start justify-between mb-2">
        <div class="flex-1">
          <p class="text-sm text-on-surface font-medium">${escHtml(exp.strategy)}</p>
          <p class="text-xs text-on-surface-variant mt-1">${escHtml(exp.insight)}</p>
        </div>
        <span class="px-2 py-0.5 rounded-full text-xs ${outcomeBadge} shrink-0 ml-3">${outcomeLabel}</span>
      </div>
      <p class="text-[11px] text-on-surface-variant/50">${exp.timestamp}</p>
    </div>
  `;
}

function renderExperienceModal(): string {
  const exp = experiences.find(e => e.id === experienceDetailId);
  if (!exp) return '';

  const outcomeLabel = exp.outcome === 'success'
    ? (t('explore.experience.success') || 'Success')
    : (t('explore.experience.failure') || 'Failure');
  const outcomeBadge = exp.outcome === 'success'
    ? 'bg-success/15 text-success'
    : 'bg-error/15 text-error';
  const borderColor = exp.outcome === 'success' ? 'border-l-success' : 'border-l-error';

  return `
    <div id="experience-modal-overlay" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div class="bg-surface rounded-2xl border border-outline-variant/20 shadow-xl max-w-lg w-full mx-4 border-l-4 ${borderColor}">
        <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <h3 class="text-base font-headline font-semibold text-on-surface">
            ${t('explore.experience.detail') || 'Experience Detail'}
          </h3>
          <button id="btn-close-exp-modal" class="text-on-surface-variant hover:text-on-surface text-lg">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-on-surface-variant/60">${t('explore.experience.outcome') || 'Outcome'}:</span>
            <span class="px-2 py-0.5 rounded-full text-xs ${outcomeBadge}">${outcomeLabel}</span>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant/60 mb-1">${t('explore.experience.strategy') || 'Strategy'}</p>
            <p class="text-sm text-on-surface">${escHtml(exp.strategy)}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant/60 mb-1">${t('explore.experience.insight') || 'Insight'}</p>
            <p class="text-sm text-on-surface">${escHtml(exp.insight)}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant/60 mb-1">${t('explore.experience.timestamp') || 'Timestamp'}</p>
            <p class="text-sm text-on-surface font-mono">${escHtml(exp.timestamp)}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDiscoveredNode(node: DiscoveredNode): string {
  const isOnline = node.status === 'online';
  const statusBadge = isOnline
    ? 'bg-success/15 text-success'
    : 'bg-error/15 text-error';
  const statusLabel = isOnline
    ? (t('explore.discovery.online') || 'Online')
    : (t('explore.discovery.offline') || 'Offline');

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5 text-on-surface text-xs font-medium">${escHtml(node.hostname)}</td>
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface">${escHtml(node.ip)}</td>
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface-variant">${node.port}</td>
      <td class="px-4 py-2.5">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-error'}"></span>
          <span class="px-2 py-0.5 rounded-full text-[11px] ${statusBadge}">${statusLabel}</span>
        </span>
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

  container.querySelector('#btn-initiate')?.addEventListener('click', async () => {
    try {
      if (explorationActive) {
        await GatewayClient.call('exploration.stop', {});
        explorationActive = false;
      } else {
        await GatewayClient.call('exploration.initiate', {});
        explorationActive = true;
      }
      renderFull();
    } catch (e) {
      console.error('Exploration protocol error:', e);
    }
  });

  container.querySelector('#btn-scan-network')?.addEventListener('click', async () => {
    discoveryScanning = true;
    renderFull();
    try {
      const result = await GatewayClient.call<{ nodes?: DiscoveredNode[] }>('exploration.mdns.scan', {});
      if (result?.nodes) {
        discoveredNodes = result.nodes;
      }
    } catch {
      // If RPC not available, load placeholder data for demonstration
      if (discoveredNodes.length === 0) {
        discoveredNodes = [
          { hostname: 'rezbot-node-1', ip: '192.168.1.10', port: 9100, status: 'online', lastSeen: new Date().toISOString() },
          { hostname: 'rezbot-node-2', ip: '192.168.1.11', port: 9100, status: 'online', lastSeen: new Date().toISOString() },
          { hostname: 'rezbot-node-3', ip: '192.168.1.12', port: 9100, status: 'offline', lastSeen: new Date(Date.now() - 300000).toISOString() },
        ];
      }
    }
    discoveryScanning = false;
    renderFull();
  });

  // P5-01: Editable threshold bars
  container.querySelectorAll('.threshold-bar').forEach(el => {
    el.addEventListener('click', () => {
      const name = (el as HTMLElement).dataset.detector || '';
      editingThreshold = editingThreshold === name ? null : name;
      renderFull();
    });
  });

  container.querySelectorAll('.threshold-save').forEach(el => {
    el.addEventListener('click', async () => {
      const name = (el as HTMLElement).dataset.detector || '';
      const input = container?.querySelector(`.threshold-input[data-detector="${name}"]`) as HTMLInputElement;
      if (!input) return;
      const val = parseFloat(input.value);
      if (isNaN(val) || val < 0 || val > 1) return;
      const det = detectors.find(d => d.name === name);
      if (det) det.threshold = val;
      editingThreshold = null;
      try {
        await GatewayClient.call('exploration.updateThreshold', { detector: name, threshold: val });
      } catch { /* best effort */ }
      renderFull();
    });
  });

  // P5-02: Workflow node expand
  container.querySelectorAll('.workflow-node-btn').forEach(el => {
    el.addEventListener('click', () => {
      const nodeId = (el as HTMLElement).dataset.node || '';
      expandedWorkflowNode = expandedWorkflowNode === nodeId ? null : nodeId;
      renderFull();
    });
  });

  container.querySelectorAll('.workflow-collapse-btn').forEach(el => {
    el.addEventListener('click', () => {
      expandedWorkflowNode = null;
      renderFull();
    });
  });

  container.querySelectorAll('.workflow-apply-params').forEach(el => {
    el.addEventListener('click', async () => {
      const nodeId = (el as HTMLElement).dataset.node || '';
      const textarea = container?.querySelector(`#workflow-params-${nodeId}`) as HTMLTextAreaElement;
      if (!textarea) return;
      const node = workflowNodes.find(n => n.id === nodeId);
      if (node) node.params = textarea.value;
      try {
        await GatewayClient.call('exploration.updateParams', { nodeId, params: textarea.value });
      } catch { /* best effort */ }
    });
  });

  // P5-03: Experience search
  container.querySelector('#experience-search')?.addEventListener('input', (e) => {
    experienceSearch = (e.target as HTMLInputElement).value;
    renderFull();
  });

  container.querySelectorAll('.exp-filter-btn').forEach(el => {
    el.addEventListener('click', () => {
      experienceFilter = ((el as HTMLElement).dataset.filter || 'all') as typeof experienceFilter;
      renderFull();
    });
  });

  // Experience card click -> modal
  container.querySelectorAll('.experience-card').forEach(el => {
    el.addEventListener('click', () => {
      experienceDetailId = (el as HTMLElement).dataset.id || null;
      renderFull();
    });
  });

  // Close experience modal
  container.querySelector('#btn-close-exp-modal')?.addEventListener('click', () => {
    experienceDetailId = null;
    renderFull();
  });
  container.querySelector('#experience-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      experienceDetailId = null;
      renderFull();
    }
  });
}
