/**
 * Office Canvas Page — Screen 02
 * Spatial task management: goal/step nodes on a pannable canvas,
 * right panel with active agents and system metrics.
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

// ── Types ──

interface GoalStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done';
}

interface GoalNode {
  id: string;
  name: string;
  steps: GoalStep[];
  x: number;
  y: number;
}

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  status: string;
}

// ── State ──

let container: HTMLElement | null = null;
let goals: GoalNode[] = [];
let agents: AgentInfo[] = [];
let unsubscribeState: (() => void) | undefined;
let unsubscribeLatency: (() => void) | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let showNewGoalModal = false;

// Canvas transform
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let canvasScale = 1;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;

// ── Render ──

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('office');
  goals = [];
  agents = [];
  canvasOffsetX = 0;
  canvasOffsetY = 0;
  canvasScale = 1;
  showNewGoalModal = false;

  renderFull();
  bindEvents();
  loadCanvasData();
  loadAgents();

  unsubscribeState = GatewayClient.onStateChange(() => {
    updateConnectionBadge();
  });

  unsubscribeLatency = GatewayClient.onLatencyChange(() => {
    updateMetrics();
  });

  // Poll agents every 15s
  pollTimer = setInterval(() => {
    loadAgents();
  }, 15_000);
}

export function cleanup(): void {
  container = null;
  unsubscribeState?.();
  unsubscribeState = undefined;
  unsubscribeLatency?.();
  unsubscribeLatency = undefined;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <style>
      .office-canvas-grid {
        background-image: radial-gradient(circle, var(--dot-color, rgba(128,128,128,0.15)) 1px, transparent 1px);
        background-size: 24px 24px;
      }
      .office-canvas-grid.dark-dots {
        --dot-color: rgba(255,255,255,0.06);
      }
      .goal-node {
        position: absolute;
        transition: box-shadow 0.15s ease;
        cursor: grab;
        user-select: none;
      }
      .goal-node:hover {
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      }
      .canvas-inner {
        transform-origin: 0 0;
      }
      .step-badge-pending { background: rgba(var(--md-warning-rgb, 234,179,8), 0.15); color: rgb(var(--md-warning-rgb, 234,179,8)); }
      .step-badge-running { background: rgba(var(--md-primary-rgb, 99,102,241), 0.15); color: rgb(var(--md-primary-rgb, 99,102,241)); }
      .step-badge-done { background: rgba(var(--md-success-rgb, 34,197,94), 0.15); color: rgb(var(--md-success-rgb, 34,197,94)); }
      .new-goal-overlay {
        animation: fadeIn 0.15s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    </style>

    <div class="flex h-full">
      <!-- Main Canvas Area -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Toolbar -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-outline-variant/20 bg-surface-container-low">
          <div class="flex items-center gap-3">
            <h1 class="text-base font-headline font-semibold text-on-surface">${t('office.title')}</h1>
            <div id="office-connection-badge" class="flex items-center gap-1.5 text-xs text-on-surface-variant/60"></div>
          </div>
          <div class="flex items-center gap-2">
            <!-- View Controls -->
            <div class="flex items-center gap-1 border border-outline-variant/20 rounded-lg p-0.5">
              <button id="zoom-out-btn" title="${t('office.zoomOut')}"
                      class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high transition text-sm font-mono">
                −
              </button>
              <span id="zoom-level" class="text-xs font-mono text-on-surface-variant/60 w-10 text-center">100%</span>
              <button id="zoom-in-btn" title="${t('office.zoomIn')}"
                      class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high transition text-sm font-mono">
                +
              </button>
              <button id="fit-view-btn" title="${t('office.fitView')}"
                      class="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high transition">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>
                </svg>
              </button>
            </div>

            <!-- New Goal Button -->
            <button id="new-goal-btn"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                           bg-primary text-on-primary hover:bg-primary-dim transition">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14m-7-7h14"/>
              </svg>
              ${t('office.newGoal')}
            </button>
          </div>
        </div>

        <!-- Canvas -->
        <div id="canvas-viewport" class="flex-1 overflow-hidden relative bg-surface office-canvas-grid cursor-crosshair">
          <div id="canvas-inner" class="canvas-inner absolute inset-0" style="transform: translate(0px, 0px) scale(1);">
            ${renderGoalNodes()}
          </div>
          ${goals.length === 0 ? renderEmptyState() : ''}
        </div>
      </div>

      <!-- Right Panel -->
      <div class="w-72 shrink-0 border-l border-outline-variant/20 bg-surface-container-lowest flex flex-col">
        <!-- Active Agents -->
        <div class="border-b border-outline-variant/20">
          <div class="px-4 py-3 flex items-center justify-between">
            <h2 class="text-sm font-headline font-semibold text-on-surface">${t('office.activeAgents')}</h2>
            <span id="agent-count" class="text-xs font-mono text-on-surface-variant/50 bg-surface-container-high px-1.5 py-0.5 rounded">
              ${agents.length}
            </span>
          </div>
          <div id="agents-list" class="px-3 pb-3 space-y-1.5 max-h-64 overflow-y-auto">
            ${renderAgentsList()}
          </div>
        </div>

        <!-- System Metrics -->
        <div class="px-4 py-3">
          <h2 class="text-sm font-headline font-semibold text-on-surface mb-3">${t('office.systemMetrics')}</h2>
          <div id="metrics-panel" class="space-y-3">
            ${renderMetrics()}
          </div>
        </div>
      </div>
    </div>

    <!-- New Goal Modal (hidden by default) -->
    <div id="new-goal-modal" class="hidden"></div>
  `;

  updateConnectionBadge();
}

function renderEmptyState(): string {
  return `
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center">
          <svg class="w-8 h-8 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25
                 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25
                 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0
                 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1
                 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18
                 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1
                 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18
                 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z"/>
          </svg>
        </div>
        <p class="text-sm text-on-surface-variant/50">${t('office.noGoals')}</p>
      </div>
    </div>
  `;
}

function renderGoalNodes(): string {
  return goals.map(goal => {
    const doneCount = goal.steps.filter(s => s.status === 'done').length;
    const totalSteps = goal.steps.length;
    const progressPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

    return `
      <div class="goal-node w-64 rounded-xl bg-surface-container border border-outline-variant/25 shadow-sm"
           data-goal-id="${goal.id}"
           style="left: ${goal.x}px; top: ${goal.y}px;">
        <!-- Header -->
        <div class="px-3 py-2.5 border-b border-outline-variant/15">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full ${doneCount === totalSteps && totalSteps > 0 ? 'bg-success' : 'bg-primary'} shrink-0"></div>
            <span class="text-sm font-headline font-semibold text-on-surface truncate">${escapeHtml(goal.name)}</span>
          </div>
        </div>

        <!-- Steps -->
        <div class="px-3 py-2 space-y-1.5">
          ${goal.steps.length > 0 ? goal.steps.map(step => `
            <div class="flex items-center gap-2 text-xs">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-medium step-badge-${step.status}">
                ${t(`office.status${capitalize(step.status)}`)}
              </span>
              <span class="text-on-surface-variant truncate">${escapeHtml(step.description)}</span>
            </div>
          `).join('') : `
            <div class="text-xs text-on-surface-variant/40 italic">${t('office.steps')}: 0</div>
          `}
        </div>

        <!-- Progress -->
        <div class="px-3 pb-2.5">
          <div class="flex items-center justify-between text-[10px] text-on-surface-variant/50 mb-1">
            <span>${t('office.progress')}</span>
            <span class="font-mono">${progressPct}%</span>
          </div>
          <div class="h-1 rounded-full bg-surface-container-high overflow-hidden">
            <div class="h-full rounded-full bg-primary transition-all duration-300" style="width: ${progressPct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAgentsList(): string {
  if (agents.length === 0) {
    return `<p class="text-xs text-on-surface-variant/40 px-1 py-2">${t('office.noAgents')}</p>`;
  }

  return agents.map(agent => {
    const statusDot = agent.status === 'active' ? 'bg-success' :
                      agent.status === 'busy'   ? 'bg-warning animate-pulse' :
                                                   'bg-on-surface-variant/30';
    return `
      <div class="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-container-high/50 transition">
        <div class="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3 3 3 0 0 1-1 5.83V17a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-1.17A3 3 0 0 1 5 10a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-on-surface truncate">${escapeHtml(agent.name)}</div>
          <div class="text-[10px] text-on-surface-variant/50">${escapeHtml(agent.role)}</div>
        </div>
        <span class="w-2 h-2 rounded-full ${statusDot} shrink-0"></span>
      </div>
    `;
  }).join('');
}

function renderMetrics(): string {
  const latency = GatewayClient.getLatency();
  const state = GatewayClient.getState();

  return `
    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container">
      <div class="text-xs text-on-surface-variant/60">${t('office.tps')}</div>
      <div class="text-sm font-mono font-medium text-on-surface">—</div>
    </div>
    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container">
      <div class="text-xs text-on-surface-variant/60">${t('office.latency')}</div>
      <div class="text-sm font-mono font-medium ${latency > 500 ? 'text-error' : latency > 200 ? 'text-warning' : 'text-on-surface'}">
        ${state === 'connected' ? latency + 'ms' : '—'}
      </div>
    </div>
    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container">
      <div class="text-xs text-on-surface-variant/60">Goals</div>
      <div class="text-sm font-mono font-medium text-on-surface">${goals.length}</div>
    </div>
  `;
}

function renderNewGoalModal(): string {
  return `
    <div class="new-goal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div class="w-96 rounded-xl bg-surface-container border border-outline-variant/25 shadow-xl">
        <div class="px-5 py-4 border-b border-outline-variant/15">
          <h3 class="text-base font-headline font-semibold text-on-surface">${t('office.newGoal')}</h3>
        </div>
        <div class="px-5 py-4 space-y-3">
          <div>
            <label class="text-xs font-medium text-on-surface-variant mb-1 block">${t('office.goalName')}</label>
            <input id="goal-name-input" type="text" placeholder="${t('office.goalNamePlaceholder')}"
                   class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                          border border-outline-variant/30 focus:border-primary outline-none transition" />
          </div>
          <div>
            <label class="text-xs font-medium text-on-surface-variant mb-1 block">${t('office.steps')}</label>
            <div id="modal-steps-list" class="space-y-1.5">
              <input type="text" placeholder="${t('office.stepPlaceholder')}"
                     class="modal-step-input w-full px-3 py-1.5 rounded-lg bg-surface-container-high text-xs text-on-surface
                            border border-outline-variant/30 focus:border-primary outline-none transition" />
            </div>
            <button id="add-step-btn"
                    class="mt-2 text-xs text-primary hover:text-primary-dim transition flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 5v14m-7-7h14"/></svg>
              ${t('office.addStep')}
            </button>
          </div>
        </div>
        <div class="px-5 py-3 border-t border-outline-variant/15 flex items-center justify-end gap-2">
          <button id="cancel-goal-btn"
                  class="px-4 py-1.5 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high transition">
            ${t('office.cancel')}
          </button>
          <button id="create-goal-btn"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-on-primary hover:bg-primary-dim transition">
            ${t('office.create')}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Events ──

function bindEvents(): void {
  if (!container) return;

  // New Goal button
  container.querySelector('#new-goal-btn')?.addEventListener('click', () => {
    openNewGoalModal();
  });

  // Zoom controls
  container.querySelector('#zoom-in-btn')?.addEventListener('click', () => {
    setZoom(Math.min(canvasScale + 0.15, 3));
  });

  container.querySelector('#zoom-out-btn')?.addEventListener('click', () => {
    setZoom(Math.max(canvasScale - 0.15, 0.3));
  });

  container.querySelector('#fit-view-btn')?.addEventListener('click', () => {
    canvasOffsetX = 0;
    canvasOffsetY = 0;
    setZoom(1);
  });

  // Canvas pan
  const viewport = container.querySelector('#canvas-viewport') as HTMLElement;
  if (viewport) {
    viewport.addEventListener('mousedown', onCanvasMouseDown);
    viewport.addEventListener('mousemove', onCanvasMouseMove);
    viewport.addEventListener('mouseup', onCanvasMouseUp);
    viewport.addEventListener('mouseleave', onCanvasMouseUp);
    viewport.addEventListener('wheel', onCanvasWheel, { passive: false });
  }
}

function onCanvasMouseDown(e: MouseEvent): void {
  // Only start panning on middle-click or when clicking the canvas background
  const target = e.target as HTMLElement;
  if (e.button === 1 || (e.button === 0 && target.id === 'canvas-viewport' || target.id === 'canvas-inner')) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartOffsetX = canvasOffsetX;
    panStartOffsetY = canvasOffsetY;
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    e.preventDefault();
  }
}

function onCanvasMouseMove(e: MouseEvent): void {
  if (!isPanning) return;
  canvasOffsetX = panStartOffsetX + (e.clientX - panStartX);
  canvasOffsetY = panStartOffsetY + (e.clientY - panStartY);
  applyCanvasTransform();
}

function onCanvasMouseUp(_e: MouseEvent): void {
  if (isPanning) {
    isPanning = false;
    if (container) {
      const viewport = container.querySelector('#canvas-viewport') as HTMLElement;
      if (viewport) viewport.style.cursor = 'crosshair';
    }
  }
}

function onCanvasWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  setZoom(Math.max(0.3, Math.min(3, canvasScale + delta)));
}

function setZoom(scale: number): void {
  canvasScale = scale;
  applyCanvasTransform();
  if (container) {
    const levelEl = container.querySelector('#zoom-level');
    if (levelEl) levelEl.textContent = Math.round(canvasScale * 100) + '%';
  }
}

function applyCanvasTransform(): void {
  if (!container) return;
  const inner = container.querySelector('#canvas-inner') as HTMLElement;
  if (inner) {
    inner.style.transform = `translate(${canvasOffsetX}px, ${canvasOffsetY}px) scale(${canvasScale})`;
  }
}

function openNewGoalModal(): void {
  if (!container) return;
  showNewGoalModal = true;

  const modal = container.querySelector('#new-goal-modal') as HTMLElement;
  if (!modal) return;

  modal.className = '';
  modal.innerHTML = renderNewGoalModal();

  // Bind modal events
  modal.querySelector('#cancel-goal-btn')?.addEventListener('click', closeNewGoalModal);
  modal.querySelector('#create-goal-btn')?.addEventListener('click', createGoalFromModal);
  modal.querySelector('#add-step-btn')?.addEventListener('click', addStepInput);

  // Focus name input
  requestAnimationFrame(() => {
    (modal.querySelector('#goal-name-input') as HTMLInputElement)?.focus();
  });

  // Close on overlay click
  const overlay = modal.querySelector('.new-goal-overlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeNewGoalModal();
  });
}

function closeNewGoalModal(): void {
  if (!container) return;
  showNewGoalModal = false;
  const modal = container.querySelector('#new-goal-modal') as HTMLElement;
  if (modal) {
    modal.className = 'hidden';
    modal.innerHTML = '';
  }
}

function addStepInput(): void {
  if (!container) return;
  const list = container.querySelector('#modal-steps-list');
  if (!list) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = t('office.stepPlaceholder');
  input.className = 'modal-step-input w-full px-3 py-1.5 rounded-lg bg-surface-container-high text-xs text-on-surface border border-outline-variant/30 focus:border-primary outline-none transition';
  list.appendChild(input);
  input.focus();
}

async function createGoalFromModal(): Promise<void> {
  if (!container) return;

  const nameInput = container.querySelector('#goal-name-input') as HTMLInputElement;
  const name = nameInput?.value.trim();
  if (!name) return;

  const stepInputs = container.querySelectorAll('.modal-step-input') as NodeListOf<HTMLInputElement>;
  const steps: GoalStep[] = [];
  stepInputs.forEach((input, i) => {
    const desc = input.value.trim();
    if (desc) {
      steps.push({ id: `step-${Date.now()}-${i}`, description: desc, status: 'pending' });
    }
  });

  // Place new goals in a grid layout
  const col = goals.length % 3;
  const row = Math.floor(goals.length / 3);
  const newGoal: GoalNode = {
    id: `goal-${Date.now()}`,
    name,
    steps,
    x: 60 + col * 290,
    y: 60 + row * 260,
  };

  // Try to persist via RPC
  try {
    await GatewayClient.call('canvas.create', {
      goal: { name, steps: steps.map(s => ({ description: s.description })) },
    });
  } catch {
    // Offline — keep local only
  }

  goals.push(newGoal);
  closeNewGoalModal();
  refreshCanvas();
}

// ── Data Loading ──

async function loadCanvasData(): Promise<void> {
  try {
    const result = await GatewayClient.call<{ goals?: GoalNode[] }>('canvas.read', {});
    if (result?.goals && Array.isArray(result.goals)) {
      goals = result.goals.map((g, i) => ({
        id: g.id || `goal-${i}`,
        name: g.name || 'Untitled',
        steps: Array.isArray(g.steps) ? g.steps.map((s, si) => ({
          id: s.id || `step-${i}-${si}`,
          description: s.description || '',
          status: (['pending', 'running', 'done'].includes(s.status) ? s.status : 'pending') as GoalStep['status'],
        })) : [],
        x: typeof g.x === 'number' ? g.x : 60 + (i % 3) * 290,
        y: typeof g.y === 'number' ? g.y : 60 + Math.floor(i / 3) * 260,
      }));
      refreshCanvas();
    }
  } catch {
    // Gateway not available — empty canvas is fine
  }
}

async function loadAgents(): Promise<void> {
  try {
    const result = await GatewayClient.call<{ agents?: AgentInfo[] }>('agents.list', {});
    if (result?.agents && Array.isArray(result.agents)) {
      agents = result.agents;
      refreshAgentsPanel();
    }
  } catch {
    // Gateway not available
  }
}

// ── Partial Refresh ──

function refreshCanvas(): void {
  if (!container) return;
  const inner = container.querySelector('#canvas-inner') as HTMLElement;
  if (!inner) return;

  inner.innerHTML = renderGoalNodes();

  // Update or remove empty state
  const viewport = container.querySelector('#canvas-viewport') as HTMLElement;
  if (!viewport) return;

  const existingEmpty = viewport.querySelector('.absolute.inset-0.flex');
  if (goals.length === 0 && !existingEmpty) {
    viewport.insertAdjacentHTML('beforeend', renderEmptyState());
  } else if (goals.length > 0 && existingEmpty) {
    existingEmpty.remove();
  }

  // Update goal count in metrics
  updateMetrics();
}

function refreshAgentsPanel(): void {
  if (!container) return;
  const list = container.querySelector('#agents-list');
  if (list) list.innerHTML = renderAgentsList();

  const count = container.querySelector('#agent-count');
  if (count) count.textContent = String(agents.length);
}

function updateConnectionBadge(): void {
  if (!container) return;
  const badge = container.querySelector('#office-connection-badge');
  if (!badge) return;

  const state = GatewayClient.getState();
  const dotColor = state === 'connected' ? 'bg-success' :
                   state === 'disconnected' ? 'bg-error' :
                   'bg-warning animate-pulse';

  badge.innerHTML = `
    <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
    <span>${t(`common.status.${state}`)}</span>
  `;
}

function updateMetrics(): void {
  if (!container) return;
  const panel = container.querySelector('#metrics-panel');
  if (panel) panel.innerHTML = renderMetrics();
}

// ── Utilities ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
