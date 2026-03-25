/**
 * Evolution Log Page — Screen 07
 * Execution history timeline, evolution tree, statistics
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;

interface RunEntry {
  id: string;
  flowName: string;
  status: 'success' | 'failure' | 'partial';
  timestamp: string;
  duration: string;
  branch?: string;
  detail?: string;
  steps?: { name: string; status: string; duration: string }[];
}

interface EvolutionBranch {
  id: string;
  label: string;
  parent?: string;
  isCurrent: boolean;
  depth: number;
  mutation?: string;
}

interface EvolutionStats {
  totalRuns: number;
  successRate: number;
  evolvedFlows: number;
  activeMutations: number;
}

let runs: RunEntry[] = [];
let branches: EvolutionBranch[] = [];
let stats: EvolutionStats = { totalRuns: 0, successRate: 0, evolvedFlows: 0, activeMutations: 0 };
let expandedRunId: string | null = null;
let timelineFilter: '' | 'success' | 'failure' | 'partial' = '';
let treeZoom = 1;
let hoveredBranchId: string | null = null;

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('flows');
  loadData();
  renderFull();
}

export function cleanup(): void {
  container = null;
}

async function loadData(): Promise<void> {
  try {
    const result = await GatewayClient.call<{
      runs?: RunEntry[];
      branches?: EvolutionBranch[];
      stats?: EvolutionStats;
    }>('evolution.status', {});
    if (result?.runs) runs = result.runs;
    if (result?.branches) branches = result.branches;
    if (result?.stats) stats = result.stats;
    renderFull();
  } catch { /* RPC may not be available */ }
}

function renderFull(): void {
  if (!container) return;

  const filteredRuns = timelineFilter
    ? runs.filter(r => r.status === timelineFilter)
    : runs;

  container.innerHTML = `
    <div class="flex flex-col h-full overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <h1 class="text-xl font-headline font-semibold text-on-surface">
          ${t('flows.evolution.title') || 'Evolution Log'}
        </h1>
        <div class="flex items-center gap-2">
          <button id="btn-confirm-evolution" class="px-3 py-1.5 rounded-lg bg-success/10 text-success text-sm font-medium hover:bg-success/20 transition">
            ${t('flows.evolution.confirmEvolution') || 'Confirm Evolution'}
          </button>
          <button id="btn-discard" class="px-3 py-1.5 rounded-lg bg-error/10 text-error text-sm font-medium hover:bg-error/20 transition">
            ${t('flows.evolution.discard') || 'Discard'}
          </button>
          <button id="btn-scan-failures" class="px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-sm font-medium hover:bg-warning/20 transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            ${t('flows.evolution.scanFailures') || 'Scan Failure Patterns'}
          </button>
        </div>
      </div>

      <div class="flex-1 p-6 space-y-6">
        <!-- Statistics Grid -->
        <section>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${renderStatCard(t('flows.evolution.status.success') || 'Total Runs', String(stats.totalRuns), 'primary')}
            ${renderStatCard(t('flows.evolution.status.success') || 'Success Rate', `${stats.successRate}%`, stats.successRate >= 80 ? 'success' : stats.successRate >= 50 ? 'warning' : 'error')}
            ${renderStatCard('Evolved Flows', String(stats.evolvedFlows), 'tertiary')}
            ${renderStatCard('Active Mutations', String(stats.activeMutations), 'secondary')}
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Execution History Timeline -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                ${t('flows.evolution.executionHistory') || 'Execution History'}
              </h2>
              <select id="timeline-filter" class="px-2 py-1 rounded-md bg-surface-container-high text-xs text-on-surface border border-outline-variant/30 outline-none">
                <option value="" ${timelineFilter === '' ? 'selected' : ''}>${t('flows.evolution.filterAll') || 'All Statuses'}</option>
                <option value="success" ${timelineFilter === 'success' ? 'selected' : ''}>${t('flows.evolution.filterSuccess') || 'Success'}</option>
                <option value="failure" ${timelineFilter === 'failure' ? 'selected' : ''}>${t('flows.evolution.filterFailure') || 'Failure'}</option>
                <option value="partial" ${timelineFilter === 'partial' ? 'selected' : ''}>${t('flows.evolution.filterPartial') || 'Partial'}</option>
              </select>
            </div>
            ${filteredRuns.length === 0 ? `
              <div class="text-center py-8 text-on-surface-variant/50 text-sm">
                ${t('flows.evolution.noHistory') || 'No execution history yet.'}
              </div>
            ` : `
              <div class="space-y-0 relative">
                <div class="absolute left-[17px] top-3 bottom-3 w-0.5 bg-outline-variant/20"></div>
                ${filteredRuns.map(renderTimelineEntry).join('')}
              </div>
            `}
          </section>

          <!-- Evolution Tree Visualization -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                ${t('flows.evolution.evolutionTree') || 'Evolution Tree'}
              </h2>
              <div class="flex items-center gap-1">
                <button id="btn-zoom-out" class="px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant text-xs hover:bg-surface-container transition" title="${t('flows.evolution.zoomOut') || 'Zoom Out'}">-</button>
                <button id="btn-zoom-reset" class="px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant text-[10px] font-mono hover:bg-surface-container transition" title="${t('flows.evolution.zoomReset') || 'Reset Zoom'}">${Math.round(treeZoom * 100)}%</button>
                <button id="btn-zoom-in" class="px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant text-xs hover:bg-surface-container transition" title="${t('flows.evolution.zoomIn') || 'Zoom In'}">+</button>
              </div>
            </div>
            <!-- Legend -->
            <div class="flex items-center gap-4 mb-2 text-[11px] text-on-surface-variant/60">
              <span class="flex items-center gap-1">
                <svg class="w-4 h-1"><line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" stroke-width="2"/></svg>
                ${t('flows.evolution.currentPath') || 'Current Path'}
              </span>
              <span class="flex items-center gap-1">
                <svg class="w-4 h-1"><line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" stroke-width="2" stroke-dasharray="4,3"/></svg>
                ${t('flows.evolution.evolutionPath') || 'Evolution Path'}
              </span>
            </div>
            <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 min-h-[200px] overflow-auto">
              <div style="transform: scale(${treeZoom}); transform-origin: top left;">
                ${branches.length === 0 ? `
                  <div class="text-center py-8 text-on-surface-variant/50 text-sm">
                    ${t('flows.evolution.noBranches') || 'No evolution branches yet.'}
                  </div>
                ` : renderEvolutionTree()}
              </div>
            </div>
            <!-- Tooltip -->
            ${hoveredBranchId ? renderBranchTooltip() : ''}
          </section>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function renderStatCard(label: string, value: string, color: string): string {
  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <p class="text-xs text-on-surface-variant/60 mb-1">${label}</p>
      <p class="text-2xl font-headline font-bold text-${color}">${value}</p>
    </div>
  `;
}

function renderTimelineEntry(run: RunEntry): string {
  const statusConfig: Record<string, { dot: string; badge: string; label: string }> = {
    success: {
      dot: 'bg-success',
      badge: '<span class="text-success text-xs font-mono">&#10003; success</span>',
      label: t('flows.evolution.status.success') || 'success',
    },
    failure: {
      dot: 'bg-error',
      badge: '<span class="text-error text-xs font-mono">&#10007; failure</span>',
      label: t('flows.evolution.status.failure') || 'failure',
    },
    partial: {
      dot: 'bg-warning',
      badge: '<span class="text-warning text-xs font-mono">&#9888; partial</span>',
      label: t('flows.evolution.status.partial') || 'partial',
    },
  };
  const cfg = statusConfig[run.status] || statusConfig.success;
  const isExpanded = expandedRunId === run.id;

  return `
    <div class="flex items-start gap-3 py-2.5 relative z-10">
      <div class="w-[34px] flex items-center justify-center shrink-0 pt-0.5">
        <div class="w-3 h-3 rounded-full ${cfg.dot} ring-4 ring-surface"></div>
      </div>
      <div class="flex-1">
        <div class="rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-3 py-2 cursor-pointer hover:bg-surface-container/50 transition timeline-entry" data-id="${run.id}">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-on-surface">${escHtml(run.flowName)}</span>
            ${cfg.badge}
          </div>
          <div class="flex items-center gap-3 mt-1 text-[11px] text-on-surface-variant/50">
            <span>${run.timestamp}</span>
            <span>${run.duration}</span>
            ${run.branch ? `<span class="px-1.5 py-0.5 rounded bg-tertiary/10 text-tertiary">${escHtml(run.branch)}</span>` : ''}
            <span class="ml-auto text-on-surface-variant/40">${isExpanded ? '&#9650;' : '&#9660;'}</span>
          </div>
        </div>
        ${isExpanded ? `
          <div class="mt-2 ml-2 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-3 space-y-2">
            ${run.detail ? `
              <div>
                <p class="text-[11px] text-on-surface-variant/60 mb-0.5">${t('flows.evolution.detail') || 'Execution Detail'}</p>
                <p class="text-xs text-on-surface">${escHtml(run.detail)}</p>
              </div>
            ` : ''}
            ${run.steps && run.steps.length > 0 ? `
              <div class="space-y-1">
                ${run.steps.map(step => {
                  const stepColor = step.status === 'success' ? 'text-success' : step.status === 'failure' ? 'text-error' : 'text-warning';
                  const stepIcon = step.status === 'success' ? '&#10003;' : step.status === 'failure' ? '&#10007;' : '&#9888;';
                  return `
                    <div class="flex items-center gap-2 text-xs">
                      <span class="${stepColor}">${stepIcon}</span>
                      <span class="text-on-surface">${escHtml(step.name)}</span>
                      <span class="ml-auto text-on-surface-variant/50 font-mono">${escHtml(step.duration)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}
            ${!run.detail && (!run.steps || run.steps.length === 0) ? `
              <p class="text-xs text-on-surface-variant/50 italic">No additional details available.</p>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderEvolutionTree(): string {
  const sortedBranches = [...branches].sort((a, b) => a.depth - b.depth);
  const rowHeight = 40;
  const colWidth = 30;
  const svgHeight = sortedBranches.length * rowHeight + 20;

  let pathsHtml = '';
  let nodesHtml = '';

  sortedBranches.forEach((branch, idx) => {
    const x = branch.depth * colWidth + 20;
    const y = idx * rowHeight + 20;

    // Draw connection line to parent — solid for current path, dashed for evolution path
    if (branch.parent) {
      const parentIdx = sortedBranches.findIndex(b => b.id === branch.parent);
      if (parentIdx >= 0) {
        const px = sortedBranches[parentIdx].depth * colWidth + 20;
        const py = parentIdx * rowHeight + 20;
        const strokeColor = branch.isCurrent
          ? 'var(--md-sys-color-primary, #a0c4ff)'
          : 'var(--md-sys-color-outline-variant, #555)';
        const dashArray = branch.isCurrent ? '' : '4,3';
        const strokeWidth = branch.isCurrent ? '2.5' : '2';
        pathsHtml += `<path d="M${px},${py} L${px},${y} L${x},${y}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" />`;
      }
    }

    // Node circle with hover area for tooltip
    const nodeColor = branch.isCurrent
      ? 'var(--md-sys-color-primary, #a0c4ff)'
      : 'var(--md-sys-color-outline-variant, #666)';
    nodesHtml += `
      <g class="tree-node-group" data-branch="${branch.id}" style="cursor:pointer">
        <circle cx="${x}" cy="${y}" r="20" fill="transparent" />
        <circle cx="${x}" cy="${y}" r="6" fill="${nodeColor}" />
        <text x="${x + 14}" y="${y + 4}" fill="var(--md-sys-color-on-surface, #e0e0e0)" font-size="12" font-family="monospace">${escHtml(branch.label)}</text>
      </g>
    `;
    if (branch.isCurrent) {
      nodesHtml += `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${nodeColor}" stroke-width="2" opacity="0.4" />`;
    }
  });

  return `
    <svg width="100%" height="${svgHeight}" viewBox="0 0 400 ${svgHeight}" class="text-on-surface">
      ${pathsHtml}
      ${nodesHtml}
    </svg>
  `;
}

function renderBranchTooltip(): string {
  const branch = branches.find(b => b.id === hoveredBranchId);
  if (!branch) return '';

  return `
    <div id="branch-tooltip" class="absolute z-30 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 shadow-lg text-xs max-w-xs" style="pointer-events:none;">
      <p class="font-semibold text-on-surface mb-1">${escHtml(branch.label)}</p>
      ${branch.mutation ? `
        <p class="text-on-surface-variant"><span class="font-medium">${t('flows.evolution.mutation') || 'Mutation'}:</span> ${escHtml(branch.mutation)}</p>
      ` : ''}
      <p class="text-on-surface-variant/60 mt-0.5">
        ${branch.isCurrent ? (t('flows.evolution.currentPath') || 'Current Path') : (t('flows.evolution.evolutionPath') || 'Evolution Path')}
      </p>
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindEvents(): void {
  if (!container) return;

  container.querySelector('#btn-confirm-evolution')?.addEventListener('click', async () => {
    try {
      await GatewayClient.call('evolution.confirm', {});
      await loadData();
    } catch (e) {
      console.error('Confirm evolution failed:', e);
    }
  });

  container.querySelector('#btn-discard')?.addEventListener('click', async () => {
    if (confirm(t('common.confirm.delete') || 'Are you sure?')) {
      try {
        await GatewayClient.call('evolution.discard', {});
        await loadData();
      } catch (e) {
        console.error('Discard failed:', e);
      }
    }
  });

  container.querySelector('#btn-scan-failures')?.addEventListener('click', async () => {
    try {
      // P3-23: Call flows.history, filter for failures, display grouped patterns in modal
      const result = await GatewayClient.call<{ executions: Array<{ id: string; flowName: string; status: string; error?: string; timestamp: string }> }>('flows.history', {});
      const failures = (result?.executions ?? []).filter(e => e.status === 'failure' || e.status === 'failed');

      if (failures.length === 0) {
        showFailureScanModal([], 0);
        return;
      }

      // Group errors by type
      const errorGroups: Record<string, { count: number; flows: string[]; suggestion: string }> = {};
      for (const f of failures) {
        const errType = f.error || 'Unknown Error';
        if (!errorGroups[errType]) {
          errorGroups[errType] = { count: 0, flows: [], suggestion: suggestFix(errType) };
        }
        errorGroups[errType].count++;
        if (!errorGroups[errType].flows.includes(f.flowName)) {
          errorGroups[errType].flows.push(f.flowName);
        }
      }

      const patterns = Object.entries(errorGroups).map(([errorType, data]) => ({
        errorType,
        count: data.count,
        affectedFlows: data.flows,
        suggestion: data.suggestion,
      }));

      showFailureScanModal(patterns, failures.length);
    } catch (e) {
      console.error('Scan failures failed:', e);
      // Fallback: try the old RPC
      try {
        const fallbackResult = await GatewayClient.call<{ patterns: string[] }>('evolution.scanFailures', {});
        if (fallbackResult?.patterns?.length) {
          showFailureScanModal(fallbackResult.patterns.map(p => ({
            errorType: p, count: 1, affectedFlows: [] as string[], suggestion: suggestFix(p),
          })), fallbackResult.patterns.length);
        } else {
          showFailureScanModal([], 0);
        }
      } catch {
        showFailureScanModal([], 0);
      }
    }
  });

  // P5-04: Timeline filter
  container.querySelector('#timeline-filter')?.addEventListener('change', (e) => {
    timelineFilter = (e.target as HTMLSelectElement).value as typeof timelineFilter;
    renderFull();
  });

  // P5-04: Expandable timeline entries
  container.querySelectorAll('.timeline-entry').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id || '';
      expandedRunId = expandedRunId === id ? null : id;
      renderFull();
    });
  });

  // P5-05: Zoom controls
  container.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
    treeZoom = Math.min(treeZoom + 0.15, 2);
    renderFull();
  });

  container.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
    treeZoom = Math.max(treeZoom - 0.15, 0.4);
    renderFull();
  });

  container.querySelector('#btn-zoom-reset')?.addEventListener('click', () => {
    treeZoom = 1;
    renderFull();
  });

  // P5-05: Node tooltips via mouse events on SVG groups
  container.querySelectorAll('.tree-node-group').forEach(el => {
    el.addEventListener('mouseenter', () => {
      hoveredBranchId = (el as SVGElement).dataset.branch || null;
      const tooltip = container?.querySelector('#branch-tooltip');
      if (!tooltip) {
        // Insert tooltip — re-render would be heavy, do lightweight insert
        const tip = document.createElement('div');
        tip.id = 'branch-tooltip';
        tip.className = 'absolute z-30 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 shadow-lg text-xs max-w-xs';
        tip.style.pointerEvents = 'none';
        const branch = branches.find(b => b.id === hoveredBranchId);
        if (branch) {
          tip.innerHTML = `
            <p class="font-semibold text-on-surface mb-1">${escHtml(branch.label)}</p>
            ${branch.mutation ? `<p class="text-on-surface-variant"><span class="font-medium">${t('flows.evolution.mutation') || 'Mutation'}:</span> ${escHtml(branch.mutation)}</p>` : ''}
            <p class="text-on-surface-variant/60 mt-0.5">${branch.isCurrent ? (t('flows.evolution.currentPath') || 'Current Path') : (t('flows.evolution.evolutionPath') || 'Evolution Path')}</p>
          `;
          // Position near the SVG node
          const rect = (el as SVGElement).getBoundingClientRect();
          const containerRect = container!.getBoundingClientRect();
          tip.style.position = 'fixed';
          tip.style.left = `${rect.right + 8}px`;
          tip.style.top = `${rect.top}px`;
          document.body.appendChild(tip);
        }
      }
    });
    el.addEventListener('mouseleave', () => {
      hoveredBranchId = null;
      const tip = document.getElementById('branch-tooltip');
      if (tip) tip.remove();
    });
  });

  // P3-23: Close failure scan modal
  container.querySelector('#failure-scan-modal-close')?.addEventListener('click', () => {
    const overlay = container?.querySelector('#failure-scan-modal-overlay');
    if (overlay) overlay.remove();
  });
  container.querySelector('#failure-scan-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'failure-scan-modal-overlay') {
      (e.target as HTMLElement).remove();
    }
  });
}

// ── P3-23: Failure Scan Modal & Helpers ──
interface FailurePattern {
  errorType: string;
  count: number;
  affectedFlows: string[];
  suggestion: string;
}

function suggestFix(errorType: string): string {
  const lower = errorType.toLowerCase();
  if (lower.includes('timeout')) return 'Consider increasing timeout limits or optimizing slow operations.';
  if (lower.includes('auth') || lower.includes('permission')) return 'Check authentication credentials and access permissions.';
  if (lower.includes('network') || lower.includes('connection')) return 'Verify network connectivity and endpoint availability.';
  if (lower.includes('parse') || lower.includes('json') || lower.includes('syntax')) return 'Validate input data format and schema compliance.';
  if (lower.includes('memory') || lower.includes('oom')) return 'Reduce batch sizes or increase memory allocation.';
  if (lower.includes('rate') || lower.includes('limit') || lower.includes('throttl')) return 'Add retry logic with exponential backoff.';
  if (lower.includes('not found') || lower.includes('404')) return 'Verify resource paths and availability.';
  return 'Review execution logs for detailed error context and add error handling.';
}

function showFailureScanModal(patterns: FailurePattern[], totalFailures: number): void {
  if (!container) return;

  // Remove existing modal if any
  const existing = container.querySelector('#failure-scan-modal-overlay');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="failure-scan-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-2xl mx-4 p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-headline font-semibold text-on-surface">
            ${t('flows.library.flows.scanResults') || 'Failure Scan Results'}
          </h3>
          <span class="text-xs text-on-surface-variant/60">${totalFailures} total failures</span>
        </div>

        <div class="flex-1 overflow-y-auto space-y-3">
          ${patterns.length === 0 ? `
            <div class="text-center py-8">
              <svg class="w-10 h-10 mx-auto mb-2 text-success/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
              <p class="text-sm text-on-surface-variant/60">${t('flows.library.flows.scanResultsEmpty') || 'No failure patterns detected'}</p>
            </div>
          ` : patterns.map(p => `
            <div class="rounded-xl border border-error/20 bg-error/5 p-4 space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z"/>
                  </svg>
                  <span class="text-sm font-semibold text-error">${escHtml(p.errorType)}</span>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-error/15 text-error">${p.count}x</span>
              </div>
              ${p.affectedFlows.length > 0 ? `
                <div class="flex items-center gap-1 flex-wrap">
                  <span class="text-[10px] text-on-surface-variant/60">Affected:</span>
                  ${p.affectedFlows.map(f => `<span class="px-1.5 py-0.5 rounded text-[10px] bg-surface-container-high text-on-surface-variant">${escHtml(f)}</span>`).join('')}
                </div>
              ` : ''}
              <div class="flex items-start gap-1.5 pt-1 border-t border-outline-variant/10">
                <svg class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
                </svg>
                <span class="text-xs text-on-surface-variant">${escHtml(p.suggestion)}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="flex justify-end pt-2 border-t border-outline-variant/20">
          <button id="failure-scan-modal-close"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('flows.library.flows.scanClose') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', modalHtml);

  // Bind modal close events
  container.querySelector('#failure-scan-modal-close')?.addEventListener('click', () => {
    container?.querySelector('#failure-scan-modal-overlay')?.remove();
  });
  container.querySelector('#failure-scan-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'failure-scan-modal-overlay') {
      (e.target as HTMLElement).remove();
    }
  });
}
