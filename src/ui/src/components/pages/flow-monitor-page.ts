/**
 * Flow Execution Monitor Page — Screen 15
 * Two-panel layout: Real-time BT graph visualization + Execution log terminal
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

// ── Types ──
interface BTNode {
  id: string;
  type: string;
  name: string;
  status: 'success' | 'failure' | 'running' | 'idle';
  children?: BTNode[];
}

interface LogEntry {
  timestamp: number;
  type: 'TOOL_CALL' | 'LLM' | 'BT_STATE' | 'ERROR' | 'INFO';
  message: string;
}

interface BlackboardVar {
  key: string;
  value: string;
}

interface ExecutionState {
  flowId: string;
  flowName: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'idle';
  progress: number; // 0-100
  root: BTNode | null;
  logs: LogEntry[];
  blackboard: BlackboardVar[];
  startTime: number;
  elapsed: number;
}

// ── State ──
let container: HTMLElement | null = null;
let execution: ExecutionState = createIdleState();
let autoScroll = true;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let notifUnsub: (() => void) | undefined;

function createIdleState(): ExecutionState {
  return {
    flowId: '',
    flowName: '',
    status: 'idle',
    progress: 0,
    root: null,
    logs: [],
    blackboard: [],
    startTime: 0,
    elapsed: 0,
  };
}

// ── Render ──
export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('flows');
  loadExecution();
  renderFull();
  bindEvents();
  startPolling();
  listenNotifications();
}

export function cleanup(): void {
  container = null;
  stopPolling();
  notifUnsub?.();
  notifUnsub = undefined;
  execution = createIdleState();
}

async function loadExecution(): Promise<void> {
  try {
    const result = await GatewayClient.call<ExecutionState>('flows.execution.status');
    if (result) {
      execution = result;
    }
  } catch {
    // Use demo data on failure
    execution = createDemoExecution();
  }
  renderFull();
  bindEvents();
}

function createDemoExecution(): ExecutionState {
  return {
    flowId: 'flow-demo-1',
    flowName: 'Analysis Pipeline',
    status: 'running',
    progress: 62,
    startTime: Date.now() - 45000,
    elapsed: 45,
    root: {
      id: 'n1', type: 'sequence', name: 'Root Sequence', status: 'running',
      children: [
        { id: 'n2', type: 'condition', name: 'Validate Input', status: 'success' },
        {
          id: 'n3', type: 'selector', name: 'Process Data', status: 'running',
          children: [
            { id: 'n4', type: 'llm', name: 'LLM Analysis', status: 'running' },
            { id: 'n5', type: 'action', name: 'Fallback Parse', status: 'idle' },
          ],
        },
        { id: 'n6', type: 'action', name: 'Store Results', status: 'idle' },
        { id: 'n7', type: 'action', name: 'Send Notification', status: 'idle' },
      ],
    },
    logs: [
      { timestamp: Date.now() - 44000, type: 'BT_STATE',  message: 'Flow execution started: Analysis Pipeline' },
      { timestamp: Date.now() - 43000, type: 'BT_STATE',  message: 'Entering node: Root Sequence [sequence]' },
      { timestamp: Date.now() - 42000, type: 'BT_STATE',  message: 'Entering node: Validate Input [condition]' },
      { timestamp: Date.now() - 41000, type: 'TOOL_CALL', message: 'validate_schema({input: "data.json"}) -> OK' },
      { timestamp: Date.now() - 40000, type: 'BT_STATE',  message: 'Node Validate Input -> SUCCESS' },
      { timestamp: Date.now() - 38000, type: 'BT_STATE',  message: 'Entering node: Process Data [selector]' },
      { timestamp: Date.now() - 37000, type: 'BT_STATE',  message: 'Entering node: LLM Analysis [llm]' },
      { timestamp: Date.now() - 35000, type: 'LLM',       message: 'Calling gpt-4 with prompt (256 tokens)...' },
      { timestamp: Date.now() - 20000, type: 'LLM',       message: 'Streaming response... 128/~512 tokens received' },
      { timestamp: Date.now() - 5000,  type: 'LLM',       message: 'Streaming response... 384/~512 tokens received' },
    ],
    blackboard: [
      { key: 'input_path', value: 'data.json' },
      { key: 'schema_valid', value: 'true' },
      { key: 'llm_model', value: 'gpt-4' },
      { key: 'token_count', value: '384' },
      { key: 'retry_count', value: '0' },
    ],
  };
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (execution.status !== 'running' && execution.status !== 'paused') return;
    try {
      const result = await GatewayClient.call<ExecutionState>('flows.execution.status');
      if (result) {
        execution = result;
        renderFull();
        bindEvents();
      }
    } catch {
      // Skip on error
    }
  }, 2000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function listenNotifications(): void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as Record<string, unknown>;
    if (detail.method === 'flows.execution.log') {
      const entry = detail.params as unknown as LogEntry;
      if (entry) {
        execution.logs.push(entry);
        updateLogPanel();
      }
    }
    if (detail.method === 'flows.execution.update') {
      const update = detail.params as unknown as Partial<ExecutionState>;
      if (update.status) execution.status = update.status;
      if (update.progress != null) execution.progress = update.progress;
      if (update.root) execution.root = update.root;
      if (update.blackboard) execution.blackboard = update.blackboard;
      renderFull();
      bindEvents();
    }
  };
  window.addEventListener('rpc-notification', handler);
  notifUnsub = () => window.removeEventListener('rpc-notification', handler);
}

function renderFull(): void {
  if (!container) return;

  const isActive = execution.status === 'running' || execution.status === 'paused';

  container.innerHTML = `
    <div class="flex flex-col h-full overflow-hidden">
      <!-- Header Bar -->
      <div class="flex items-center gap-3 px-4 py-2 border-b border-outline-variant/20 bg-surface-container-low">
        <h2 class="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
          <svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5"/>
          </svg>
          ${t('flows.monitor.title')}
        </h2>
        <div class="flex-1"></div>
        ${isActive ? `
          <span class="text-[10px] font-mono text-on-surface-variant/60">
            ${execution.flowName} | ${formatElapsed(execution.elapsed)}
          </span>
        ` : ''}
        <!-- Control Buttons -->
        <div class="flex items-center gap-1.5">
          <button id="btn-pause"
                  class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition
                         ${execution.status === 'running'
                           ? 'bg-warning/15 text-warning hover:bg-warning/25 border border-warning/30'
                           : execution.status === 'paused'
                             ? 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
                             : 'bg-surface-container text-on-surface-variant/40 border border-outline-variant/20 cursor-not-allowed'}"
                  ${!isActive ? 'disabled' : ''}>
            ${execution.status === 'paused' ? `
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>
              </svg>
              ${t('flows.monitor.resume')}
            ` : `
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"/>
              </svg>
              ${t('flows.monitor.pause')}
            `}
          </button>
          <button id="btn-abort"
                  class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition
                         ${isActive
                           ? 'bg-error/15 text-error hover:bg-error/25 border border-error/30'
                           : 'bg-surface-container text-on-surface-variant/40 border border-outline-variant/20 cursor-not-allowed'}"
                  ${!isActive ? 'disabled' : ''}>
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
            </svg>
            ${t('flows.monitor.abort')}
          </button>
          <button id="btn-view-log"
                  class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
                         bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition
                         border border-outline-variant/30">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
            </svg>
            ${t('flows.monitor.viewLog')}
          </button>
        </div>
      </div>

      <!-- Progress Bar -->
      ${isActive || execution.status === 'completed' || execution.status === 'failed' ? `
        <div class="h-1.5 bg-surface-container-high relative">
          <div class="absolute inset-y-0 left-0 transition-all duration-500 rounded-r-full
                      ${execution.status === 'failed' ? 'bg-error' :
                        execution.status === 'completed' ? 'bg-success' :
                        execution.status === 'paused' ? 'bg-warning' : 'bg-primary'}"
               style="width: ${execution.progress}%">
            ${execution.status === 'running' ? '<div class="absolute inset-0 bg-white/20 animate-pulse rounded-r-full"></div>' : ''}
          </div>
          <div class="absolute right-2 -top-0.5 text-[9px] font-mono text-on-surface-variant/50">${execution.progress}%</div>
        </div>
      ` : ''}

      <!-- Main Content -->
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Top: BT Graph Visualization -->
        <div class="flex-1 overflow-auto relative"
             style="background-image: radial-gradient(circle, rgba(var(--md-on-surface-rgb, 200,200,200), 0.08) 1px, transparent 1px);
                    background-size: 24px 24px;">
          ${execution.root ? renderBTGraph() : renderNoExecution()}
        </div>

        <!-- Bottom Panel: Execution Log Terminal -->
        <div class="h-48 shrink-0 border-t border-outline-variant/30 flex">
          <!-- Log Area -->
          <div class="flex-1 flex flex-col min-w-0">
            <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-container-lowest border-b border-outline-variant/20">
              <span class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
                ${t('flows.monitor.executionLog')}
              </span>
              <div class="flex-1"></div>
              <label class="flex items-center gap-1 text-[10px] text-on-surface-variant/50 cursor-pointer">
                <input type="checkbox" id="auto-scroll-check" ${autoScroll ? 'checked' : ''}
                       class="w-3 h-3 rounded accent-primary"/>
                Auto-scroll
              </label>
            </div>
            <div id="log-terminal" class="flex-1 overflow-y-auto bg-[#0d1117] font-mono text-xs p-2 space-y-0.5">
              ${renderLogEntries()}
            </div>
          </div>

          <!-- Blackboard Sidebar -->
          <div class="w-52 shrink-0 border-l border-outline-variant/20 bg-surface-container-lowest flex flex-col">
            <div class="px-3 py-1.5 border-b border-outline-variant/20">
              <span class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
                ${t('flows.monitor.blackboard')}
              </span>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
              ${renderBlackboard()}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Auto-scroll log
  if (autoScroll) {
    const logEl = container?.querySelector('#log-terminal');
    if (logEl) {
      requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; });
    }
  }
}

// ── BT Graph ──
function renderBTGraph(): string {
  if (!execution.root) return renderNoExecution();

  const svgLines: string[] = [];
  const nodeBoxes: string[] = [];
  layoutTree(execution.root, 0, 0, nodeBoxes, svgLines);

  const treeW = getTreeWidth(execution.root) * 180;
  const treeH = getTreeDepth(execution.root) * 110;
  const canvasW = Math.max(treeW + 100, 800);
  const canvasH = Math.max(treeH + 100, 400);

  return `
    <div class="absolute inset-0 flex items-start justify-center pt-6 overflow-auto">
      <svg width="${canvasW}" height="${canvasH}" class="shrink-0">
        ${svgLines.join('\n')}
        ${nodeBoxes.join('\n')}
      </svg>
    </div>
  `;
}

function layoutTree(node: BTNode, depth: number, index: number, boxes: string[], lines: string[]): { x: number; y: number } {
  const xSpacing = 180;
  const ySpacing = 110;

  let x: number;
  const y = depth * ySpacing + 40;

  if (!node.children || node.children.length === 0) {
    x = index * xSpacing + 90;
  } else {
    const childPositions: Array<{ x: number; y: number }> = [];
    let childIdx = index;
    for (const child of node.children) {
      const pos = layoutTree(child, depth + 1, childIdx, boxes, lines);
      childPositions.push(pos);
      childIdx += getTreeWidth(child);
    }
    const firstX = childPositions[0].x;
    const lastX = childPositions[childPositions.length - 1].x;
    x = (firstX + lastX) / 2;

    // Draw connection lines with status-aware coloring
    for (const cp of childPositions) {
      const lineColor = getLineColor(node.status);
      lines.push(`<line x1="${x}" y1="${y + 36}" x2="${cp.x}" y2="${cp.y}"
                        stroke="${lineColor}" stroke-width="1.5"/>`);
    }
  }

  // Render node box
  const borderClass = getStatusBorder(node.status);
  const statusDot = getStatusDot(node.status);
  const typeIcon = getTypeIcon(node.type);

  boxes.push(`
    <foreignObject x="${x - 75}" y="${y}" width="150" height="36">
      <div xmlns="http://www.w3.org/1999/xhtml"
           class="monitor-node flex items-center gap-1.5 px-2 py-1.5 rounded-lg
                  border-2 ${borderClass}
                  bg-surface-container-high transition"
           data-node-id="${node.id}">
        <span class="text-[10px] shrink-0">${typeIcon}</span>
        <span class="text-[11px] text-on-surface font-medium truncate flex-1">${escapeHtml(node.name)}</span>
        <span class="w-2 h-2 rounded-full shrink-0 ${statusDot}"></span>
      </div>
    </foreignObject>
  `);

  return { x, y };
}

function getTreeWidth(node: BTNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + getTreeWidth(c), 0);
}

function getTreeDepth(node: BTNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(getTreeDepth));
}

function getStatusBorder(status: string): string {
  switch (status) {
    case 'success': return 'border-success';
    case 'running': return 'border-blue-500 animate-pulse';
    case 'failure': return 'border-error';
    default:        return 'border-outline-variant/30';
  }
}

function getStatusDot(status: string): string {
  switch (status) {
    case 'success': return 'bg-success';
    case 'running': return 'bg-blue-500 animate-pulse';
    case 'failure': return 'bg-error';
    default:        return 'bg-gray-500/40';
  }
}

function getLineColor(status: string): string {
  switch (status) {
    case 'success': return 'rgba(74, 222, 128, 0.5)';
    case 'running': return 'rgba(59, 130, 246, 0.5)';
    case 'failure': return 'rgba(248, 113, 113, 0.5)';
    default:        return 'rgba(150, 150, 150, 0.2)';
  }
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    sequence: '⇢', selector: '?', fallback: '↩',
    action: '▶', llm: '✦',
    condition: '◇', fsm: '◎',
  };
  return icons[type] ?? '●';
}

function renderNoExecution(): string {
  return `
    <div class="flex flex-col items-center justify-center h-full gap-3">
      <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center">
        <svg class="w-8 h-8 text-primary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3"/>
        </svg>
      </div>
      <p class="text-sm text-on-surface-variant/50">${t('flows.monitor.noExecution')}</p>
    </div>
  `;
}

// ── Log Entries ──
function renderLogEntries(): string {
  if (execution.logs.length === 0) {
    return '<div class="text-gray-600 text-center py-4">No log entries</div>';
  }

  return execution.logs.map(entry => {
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const typeColor = getLogTypeColor(entry.type);
    const typeLabel = getLogTypeLabel(entry.type);

    return `
      <div class="flex gap-2 leading-tight py-0.5 hover:bg-white/5 px-1 rounded">
        <span class="text-gray-600 shrink-0">${time}</span>
        <span class="${typeColor} font-semibold shrink-0 w-16 text-right">[${typeLabel}]</span>
        <span class="text-gray-300 break-all">${escapeHtml(entry.message)}</span>
      </div>
    `;
  }).join('');
}

function getLogTypeColor(type: string): string {
  switch (type) {
    case 'TOOL_CALL': return 'text-cyan-400';
    case 'LLM':       return 'text-purple-400';
    case 'BT_STATE':  return 'text-yellow-400';
    case 'ERROR':     return 'text-red-400';
    default:          return 'text-gray-400';
  }
}

function getLogTypeLabel(type: string): string {
  switch (type) {
    case 'TOOL_CALL': return 'TOOL';
    case 'LLM':       return 'LLM';
    case 'BT_STATE':  return 'BT';
    case 'ERROR':     return 'ERR';
    default:          return 'INFO';
  }
}

function updateLogPanel(): void {
  if (!container) return;
  const logEl = container.querySelector('#log-terminal');
  if (!logEl) return;

  logEl.innerHTML = renderLogEntries();
  if (autoScroll) {
    requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; });
  }
}

// ── Blackboard ──
function renderBlackboard(): string {
  if (execution.blackboard.length === 0) {
    return `<div class="text-xs text-on-surface-variant/40 text-center py-4">${t('flows.monitor.blackboardEmpty')}</div>`;
  }

  return execution.blackboard.map(v => `
    <div class="flex items-start gap-1 text-[11px] py-0.5">
      <span class="text-primary/70 font-mono shrink-0 font-semibold">${escapeHtml(v.key)}</span>
      <span class="text-on-surface-variant/40">=</span>
      <span class="text-on-surface font-mono break-all">${escapeHtml(v.value)}</span>
    </div>
  `).join('');
}

// ── Events ──
function bindEvents(): void {
  if (!container) return;

  container.querySelector('#btn-pause')?.addEventListener('click', async () => {
    const isRunning = execution.status === 'running';
    const action = isRunning ? 'pause' : 'resume';
    try {
      await GatewayClient.call('flows.control', { flowId: execution.flowId, action });
      execution.status = isRunning ? 'paused' : 'running';
      execution.logs.push({
        timestamp: Date.now(),
        type: 'INFO',
        message: isRunning
          ? (t('flows.monitor.paused') || 'Flow paused')
          : (t('flows.monitor.resumed') || 'Flow resumed'),
      });
    } catch {
      // Toggle locally for demo
      execution.status = isRunning ? 'paused' : 'running';
      execution.logs.push({
        timestamp: Date.now(),
        type: 'INFO',
        message: isRunning
          ? (t('flows.monitor.paused') || 'Flow paused')
          : (t('flows.monitor.resumed') || 'Flow resumed'),
      });
    }
    renderFull();
    bindEvents();
  });

  container.querySelector('#btn-abort')?.addEventListener('click', async () => {
    // Show confirmation dialog before aborting
    const confirmMsg = t('flows.monitor.abortConfirm') || 'Are you sure you want to abort this execution? This cannot be undone.';
    if (!confirm(confirmMsg)) return;

    try {
      await GatewayClient.call('flows.abort', { flowId: execution.flowId });
      execution.status = 'failed';
      execution.logs.push({
        timestamp: Date.now(),
        type: 'ERROR',
        message: t('flows.monitor.aborted') || 'Execution aborted by user',
      });
    } catch {
      execution.status = 'failed';
      execution.logs.push({
        timestamp: Date.now(),
        type: 'ERROR',
        message: t('flows.monitor.aborted') || 'Execution aborted by user',
      });
    }
    renderFull();
    bindEvents();
  });

  container.querySelector('#auto-scroll-check')?.addEventListener('change', (e) => {
    autoScroll = (e.target as HTMLInputElement).checked;
  });
}

// ── Utilities ──
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
