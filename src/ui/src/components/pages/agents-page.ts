/**
 * Agent Swarm Page — Screen 05
 * Bento-grid dashboard: swarm overview stats, blueprint cards,
 * instance table, team management, routing rules, delegation trace, event bus.
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

// ── Types ──
interface Blueprint {
  id: string;
  role: string;
  description?: string;
  capabilities?: string[];
  configParams?: Record<string, string>;
  spawnCount?: number;
}

interface AgentInstance {
  id: string;
  name: string;
  blueprintId: string;
  blueprintRole?: string;
  status: 'active' | 'idle' | 'standby';
  uptime: number; // seconds
}

interface Team {
  id: string;
  name: string;
  members: string[];
  strategy: string;
}

interface RouteRule {
  id: string;
  pattern: string;
  agent: string;
  priority: number;
}

interface DelegationEvent {
  id: string;
  from: string;
  to: string;
  task: string;
  timestamp: number;
}

interface BusEvent {
  id: string;
  type: 'spawn' | 'message' | 'error' | 'info';
  topic: string;
  timestamp: number;
  payload: string;
}

// ── State ──
let container: HTMLElement | null = null;
let blueprints: Blueprint[] = [];
let instances: AgentInstance[] = [];
let teams: Team[] = [];
let routeRules: RouteRule[] = [];
let delegationEvents: DelegationEvent[] = [];
let busEvents: BusEvent[] = [];
let loading = true;
let errorMsg = '';
let unsubscribeState: (() => void) | undefined;
let expandedBlueprintId: string | null = null;
let showCreateTeamModal = false;
let editTeamModal: { show: boolean; team: Team | null } = { show: false, team: null };
let showRoutingSection = false;
let routeEditModal: { show: boolean; rule: RouteRule | null } = { show: false, rule: null };
let eventBusPaused = false;
let eventBusTimer: ReturnType<typeof setInterval> | null = null;
let busNotifUnsub: (() => void) | undefined;

// ── Default blueprint stubs (used when RPC returns empty) ──
const DEFAULT_BLUEPRINTS: Blueprint[] = [
  { id: 'analyst',    role: 'Analyst',    description: 'Data analysis & insight extraction',    capabilities: ['data-analysis', 'summarization', 'statistics'], configParams: { model: 'gpt-4', temperature: '0.7' }, spawnCount: 3 },
  { id: 'researcher', role: 'Researcher', description: 'Deep research & source gathering',      capabilities: ['web-search', 'citation', 'synthesis'], configParams: { maxSources: '10', depth: 'deep' }, spawnCount: 5 },
  { id: 'critic',     role: 'Critic',     description: 'Review, critique & quality assurance',   capabilities: ['code-review', 'logic-check', 'adversarial'], configParams: { strictness: 'high' }, spawnCount: 2 },
  { id: 'architect',  role: 'Architect',  description: 'System design & structural planning',    capabilities: ['design', 'diagramming', 'trade-off-analysis'], configParams: { framework: 'C4', notation: 'UML' }, spawnCount: 1 },
];

// Color tokens per blueprint index
const BLUEPRINT_COLORS = [
  { border: 'border-primary',   bg: 'bg-primary/10',   text: 'text-primary',   dot: 'bg-primary' },
  { border: 'border-secondary', bg: 'bg-secondary/10', text: 'text-secondary', dot: 'bg-secondary' },
  { border: 'border-tertiary',  bg: 'bg-tertiary/10',  text: 'text-tertiary',  dot: 'bg-tertiary' },
  { border: 'border-error',     bg: 'bg-error/10',     text: 'text-error',     dot: 'bg-error' },
];

// ── Render ──
export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('agents');

  loading = true;
  errorMsg = '';
  blueprints = [];
  instances = [];
  teams = [];
  routeRules = [];
  delegationEvents = [];
  busEvents = [];
  expandedBlueprintId = null;
  showCreateTeamModal = false;
  editTeamModal = { show: false, team: null };
  showRoutingSection = false;
  routeEditModal = { show: false, rule: null };
  eventBusPaused = false;

  renderFull();
  loadData();

  unsubscribeState = GatewayClient.onStateChange(() => {
    renderFull();
  });

  // Start event bus auto-refresh
  startEventBusPolling();
  listenBusNotifications();
}

export function cleanup(): void {
  container = null;
  unsubscribeState?.();
  unsubscribeState = undefined;
  stopEventBusPolling();
  busNotifUnsub?.();
  busNotifUnsub = undefined;
}

function startEventBusPolling(): void {
  stopEventBusPolling();
  eventBusTimer = setInterval(async () => {
    if (eventBusPaused) return;
    try {
      const result = await GatewayClient.call<BusEvent[]>('agents.eventBus');
      if (Array.isArray(result)) {
        busEvents = result;
        const busEl = container?.querySelector('#event-bus-content');
        if (busEl) busEl.innerHTML = renderBusEventRows();
      }
    } catch {
      // Silently fail
    }
  }, 5000);
}

function stopEventBusPolling(): void {
  if (eventBusTimer) {
    clearInterval(eventBusTimer);
    eventBusTimer = null;
  }
}

function listenBusNotifications(): void {
  busNotifUnsub?.();
  const handler = (e: Event) => {
    if (eventBusPaused) return;
    const detail = (e as CustomEvent).detail as Record<string, unknown>;
    if (detail.method === 'agents.eventBus.event') {
      const ev = detail.params as unknown as BusEvent;
      if (ev) {
        busEvents.unshift(ev);
        if (busEvents.length > 50) busEvents.length = 50;
        const busEl = container?.querySelector('#event-bus-content');
        if (busEl) busEl.innerHTML = renderBusEventRows();
      }
    }
  };
  window.addEventListener('rpc-notification', handler);
  busNotifUnsub = () => window.removeEventListener('rpc-notification', handler);
}

async function loadData(): Promise<void> {
  loading = true;
  errorMsg = '';
  renderFull();

  try {
    const [bpResult, instResult, teamResult, routeResult, delegResult, busResult] = await Promise.allSettled([
      GatewayClient.call<Blueprint[]>('agents.blueprints.list'),
      GatewayClient.call<AgentInstance[]>('agents.list'),
      GatewayClient.call<Team[]>('swarm.getTeams'),
      GatewayClient.call<RouteRule[]>('flows.routes.list'),
      GatewayClient.call<DelegationEvent[]>('agents.delegationTrace'),
      GatewayClient.call<BusEvent[]>('agents.eventBus'),
    ]);

    blueprints = bpResult.status === 'fulfilled' && Array.isArray(bpResult.value)
      ? bpResult.value : DEFAULT_BLUEPRINTS;
    instances = instResult.status === 'fulfilled' && Array.isArray(instResult.value)
      ? instResult.value : [];
    teams = teamResult.status === 'fulfilled' && Array.isArray(teamResult.value)
      ? teamResult.value : [];
    routeRules = routeResult.status === 'fulfilled' && Array.isArray(routeResult.value)
      ? routeResult.value : [];
    delegationEvents = delegResult.status === 'fulfilled' && Array.isArray(delegResult.value)
      ? delegResult.value : [];
    busEvents = busResult.status === 'fulfilled' && Array.isArray(busResult.value)
      ? busResult.value : [];

    if (blueprints.length === 0) blueprints = DEFAULT_BLUEPRINTS;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    blueprints = DEFAULT_BLUEPRINTS;
  }

  loading = false;
  renderFull();
  bindEvents();
}

function renderFull(): void {
  if (!container) return;

  const state = GatewayClient.getState();
  const dotColor = state === 'connected' ? 'bg-success' : state === 'disconnected' ? 'bg-error' : 'bg-warning animate-pulse';

  const totalAgents = instances.length;
  const activeCount = instances.filter(i => i.status === 'active').length;
  const idleCount = instances.filter(i => i.status === 'idle').length;
  const teamsCount = teams.length;

  container.innerHTML = `
    <div class="h-full overflow-y-auto">
      <div class="max-w-7xl mx-auto px-4 py-5 space-y-5">

        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              ${swarmIconSvg()}
            </div>
            <div>
              <h1 class="text-xl font-headline font-bold text-on-surface">
                ${t('agents.title') || 'Agent Swarm'}
              </h1>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                <span class="text-xs text-on-surface-variant/60">${t(`common.status.${state}`)}</span>
              </div>
            </div>
          </div>
          <button id="agents-refresh-btn"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium
                         bg-surface-container-high text-on-surface-variant
                         hover:bg-primary/10 hover:text-primary border border-outline-variant/30 transition
                         flex items-center gap-1.5">
            ${refreshIconSvg()}
            ${t('agents.refresh') || 'Refresh'}
          </button>
        </div>

        ${loading ? renderLoading() : errorMsg ? renderError() : renderDashboard(totalAgents, activeCount, idleCount, teamsCount)}

      </div>
    </div>

    ${showCreateTeamModal ? renderCreateTeamModal() : ''}
    ${editTeamModal.show ? renderEditTeamModal() : ''}
    ${routeEditModal.show ? renderRouteEditModal() : ''}
  `;
}

function renderLoading(): string {
  return `
    <div class="flex flex-col items-center justify-center py-20 gap-3">
      <svg class="w-8 h-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span class="text-sm text-on-surface-variant/60">${t('agents.loading') || 'Loading...'}</span>
    </div>
  `;
}

function renderError(): string {
  return `
    <div class="flex flex-col items-center justify-center py-20 gap-3">
      <div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
        <svg class="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
        </svg>
      </div>
      <span class="text-sm text-error">${t('agents.error.loadFailed') || 'Failed to load data'}</span>
      <span class="text-xs text-on-surface-variant/40">${escapeHtml(errorMsg)}</span>
    </div>
  `;
}

function renderDashboard(total: number, active: number, idle: number, teamsCt: number): string {
  return `
    <!-- Stats Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${renderStatCard(t('agents.totalAgents') || 'Total Agents', String(total), 'bg-primary/10', 'text-primary')}
      ${renderStatCard(t('agents.activeAgents') || 'Active', String(active), 'bg-success/10', 'text-success')}
      ${renderStatCard(t('agents.idleAgents') || 'Idle', String(idle), 'bg-warning/10', 'text-warning')}
      ${renderStatCard(t('agents.teamsCount') || 'Teams', String(teamsCt), 'bg-secondary/10', 'text-secondary')}
    </div>

    <!-- Bento Grid: Blueprints + Teams -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

      <!-- Blueprints Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-headline font-semibold text-on-surface">
            ${t('agents.blueprints') || 'Blueprints'}
          </h2>
          <span class="text-xs text-on-surface-variant/50">${t('agents.blueprints.description') || 'Agent role templates'}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${blueprints.length > 0 ? blueprints.map((bp, i) => renderBlueprintCard(bp, i)).join('') : `
            <div class="col-span-2 text-center py-8 text-sm text-on-surface-variant/50">
              ${t('agents.noBlueprints') || 'No blueprints'}
            </div>
          `}
        </div>
      </div>

      <!-- Teams Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-headline font-semibold text-on-surface">
            ${t('agents.teams') || 'Team Management'}
          </h2>
          <button id="create-team-btn"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium
                         bg-secondary/10 text-secondary hover:bg-secondary/20 transition
                         flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14m-7-7h14"/>
            </svg>
            ${t('agents.teams.create') || 'Create Team'}
          </button>
        </div>
        ${teams.length > 0 ? `
          <div class="space-y-2">
            ${teams.map(renderTeamCard).join('')}
          </div>
        ` : `
          <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 text-center">
            <div class="w-10 h-10 mx-auto rounded-full bg-surface-container-high flex items-center justify-center mb-2">
              <svg class="w-5 h-5 text-on-surface-variant/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/>
              </svg>
            </div>
            <p class="text-sm text-on-surface-variant/50">${t('agents.noTeams') || 'No teams'}</p>
          </div>
        `}
      </div>
    </div>

    <!-- Routing Rules Section (P3-15) -->
    <div class="space-y-3">
      <button id="toggle-routing-btn" class="flex items-center gap-2 w-full text-left">
        <svg class="w-4 h-4 text-on-surface-variant transition-transform ${showRoutingSection ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
        </svg>
        <h2 class="text-base font-headline font-semibold text-on-surface">
          ${t('agents.routing') || 'Routing Rules'}
        </h2>
        <span class="text-xs text-on-surface-variant/50">${t('agents.routing.description') || 'Define how tasks are routed to agents'}</span>
      </button>
      ${showRoutingSection ? renderRoutingSection() : ''}
    </div>

    <!-- Delegation Trace Section (P3-16) -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-headline font-semibold text-on-surface">
          ${t('agents.delegation') || 'Delegation Trace'}
        </h2>
        <span class="text-xs text-on-surface-variant/50">${t('agents.delegation.description') || 'Timeline of task delegation events'}</span>
      </div>
      ${renderDelegationTrace()}
    </div>

    <!-- Event Bus Monitor (P3-17) -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-headline font-semibold text-on-surface">
          ${t('agents.eventBus') || 'Event Bus'}
        </h2>
        <div class="flex items-center gap-3">
          <button id="toggle-bus-pause-btn"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1
                         ${eventBusPaused
                           ? 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
                           : 'bg-warning/15 text-warning hover:bg-warning/25 border border-warning/30'}">
            ${eventBusPaused ? `
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>
              </svg>
              ${t('agents.eventBus.resume') || 'Resume'}
            ` : `
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"/>
              </svg>
              ${t('agents.eventBus.pause') || 'Pause'}
            `}
          </button>
          <span class="flex items-center gap-2 text-xs text-on-surface-variant/50">
            <span class="w-1.5 h-1.5 rounded-full ${eventBusPaused ? 'bg-warning' : 'bg-success animate-pulse'}"></span>
            ${eventBusPaused ? (t('agents.eventBus.paused') || 'Paused') : (t('agents.eventBus.autoRefresh') || 'Auto-refresh')}
          </span>
        </div>
      </div>
      ${renderEventBus()}
    </div>

    <!-- Instances Table -->
    <div class="space-y-3">
      <h2 class="text-base font-headline font-semibold text-on-surface">
        ${t('agents.instances') || 'Running Instances'}
      </h2>
      ${renderInstancesTable()}
    </div>
  `;
}

function renderStatCard(label: string, value: string, bgClass: string, textClass: string): string {
  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div class="text-xs text-on-surface-variant/60 font-label mb-1">${label}</div>
      <div class="text-2xl font-headline font-bold ${textClass}">${value}</div>
    </div>
  `;
}

// ── P3-13: Blueprint Detail Expand ──
function renderBlueprintCard(bp: Blueprint, index: number): string {
  const color = BLUEPRINT_COLORS[index % BLUEPRINT_COLORS.length];
  const roleKey = bp.role.toLowerCase();
  const roleName = t(`agents.blueprint.${roleKey}`) || bp.role;
  const capabilities = bp.capabilities ?? [];
  const isExpanded = expandedBlueprintId === bp.id;

  return `
    <div class="rounded-xl border-2 ${color.border}/40 bg-surface-container-lowest p-4 space-y-3
                hover:${color.border}/70 transition group ${isExpanded ? 'sm:col-span-2' : ''}">
      <div class="blueprint-toggle cursor-pointer" data-blueprint-id="${bp.id}">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center">
            <span class="w-2.5 h-2.5 rounded-full ${color.dot}"></span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-on-surface truncate">${roleName}</div>
            <div class="text-xs text-on-surface-variant/50 truncate">${bp.description ?? ''}</div>
          </div>
          <svg class="w-4 h-4 text-on-surface-variant/40 transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/>
          </svg>
        </div>
      </div>

      ${isExpanded ? `
        <!-- Full Capabilities List -->
        <div class="space-y-2 pt-2 border-t border-outline-variant/20">
          <div class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
            ${t('agents.blueprint.capabilities') || 'Capabilities'}
          </div>
          ${capabilities.length > 0 ? `
            <div class="flex flex-wrap gap-1">
              ${capabilities.map(c => `
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono ${color.bg} ${color.text}/70">${c}</span>
              `).join('')}
            </div>
          ` : '<p class="text-xs text-on-surface-variant/40">None</p>'}
        </div>

        <!-- Configuration Params -->
        ${bp.configParams && Object.keys(bp.configParams).length > 0 ? `
          <div class="space-y-1.5">
            <div class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
              ${t('agents.blueprint.configParams') || 'Configuration Parameters'}
            </div>
            <div class="space-y-0.5">
              ${Object.entries(bp.configParams).map(([k, v]) => `
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-on-surface-variant/60 font-mono">${escapeHtml(k)}</span>
                  <span class="text-on-surface-variant/30">=</span>
                  <span class="text-on-surface font-mono">${escapeHtml(v)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Spawn History Count -->
        <div class="flex items-center gap-2 text-xs text-on-surface-variant/60">
          <span>${t('agents.blueprint.spawnHistory') || 'Spawn History'}:</span>
          <span class="font-semibold ${color.text}">${bp.spawnCount ?? 0}</span>
          <span>${t('agents.blueprint.spawnCount') || 'spawned'}</span>
        </div>

        <!-- Spawn Instance Form -->
        <div class="pt-2 border-t border-outline-variant/20 space-y-2">
          <div class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
            ${t('agents.blueprint.spawn') || 'Spawn Instance'}
          </div>
          <div class="flex items-center gap-2">
            <input type="text" class="spawn-name-input flex-1 px-2.5 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                          border border-outline-variant/30 focus:border-primary outline-none transition"
                   placeholder="${t('agents.blueprint.spawnForm.namePlaceholder') || 'Enter instance name...'}"
                   data-blueprint-id="${bp.id}" />
            <button class="spawn-named-btn px-3 py-1.5 rounded-lg text-xs font-medium
                           ${color.bg} ${color.text} hover:opacity-80 transition
                           flex items-center gap-1"
                    data-blueprint-id="${bp.id}">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14m-7-7h14"/>
              </svg>
              ${t('agents.blueprint.spawnForm.submit') || 'Spawn'}
            </button>
          </div>
        </div>
      ` : `
        ${capabilities.length > 0 ? `
          <div class="flex flex-wrap gap-1">
            ${capabilities.slice(0, 3).map(c => `
              <span class="px-1.5 py-0.5 rounded text-[10px] font-mono ${color.bg} ${color.text}/70">${c}</span>
            `).join('')}
            ${capabilities.length > 3 ? `<span class="text-[10px] text-on-surface-variant/40">+${capabilities.length - 3}</span>` : ''}
          </div>
        ` : ''}
        <button class="spawn-btn w-full py-1.5 rounded-lg text-xs font-medium
                       ${color.bg} ${color.text} hover:opacity-80 transition
                       flex items-center justify-center gap-1"
                data-blueprint-id="${bp.id}">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14m-7-7h14"/>
          </svg>
          ${t('agents.blueprint.spawn') || 'Spawn Instance'}
        </button>
      `}
    </div>
  `;
}

// ── P3-14: Team CRUD ──
function renderTeamCard(team: Team): string {
  const strategyKey = team.strategy?.toLowerCase().replace(/[\s-]/g, '') ?? 'roundrobin';
  const strategyNames: Record<string, string> = {
    roundrobin: t('agents.teams.strategy.roundRobin') || 'Round Robin',
    consensus:  t('agents.teams.strategy.consensus')  || 'Consensus',
    hierarchy:  t('agents.teams.strategy.hierarchy')   || 'Hierarchy',
  };
  const strategyLabel = strategyNames[strategyKey] ?? team.strategy;

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold text-on-surface">${escapeHtml(team.name)}</div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-label bg-secondary/10 text-secondary">
            ${strategyLabel}
          </span>
          <button class="edit-team-btn px-2 py-0.5 rounded-lg text-[10px] font-medium
                         bg-primary/10 text-primary hover:bg-primary/20 transition"
                  data-team-id="${team.id}">
            ${t('agents.teams.edit') || 'Edit'}
          </button>
          <button class="delete-team-btn px-2 py-0.5 rounded-lg text-[10px] font-medium
                         bg-error/10 text-error hover:bg-error/20 transition"
                  data-team-id="${team.id}">
            ${t('agents.teams.delete') || 'Delete'}
          </button>
        </div>
      </div>
      <div class="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>
        </svg>
        <span>${t('agents.teams.members') || 'Members'}: ${team.members.length}</span>
        ${team.members.length > 0 ? `
          <span class="text-on-surface-variant/30">|</span>
          <span class="truncate">${team.members.slice(0, 3).map(m => escapeHtml(m)).join(', ')}${team.members.length > 3 ? '...' : ''}</span>
        ` : ''}
      </div>
    </div>
  `;
}

function renderCreateTeamModal(): string {
  const agentOptions = instances.map(inst => `
    <label class="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" class="team-member-check w-4 h-4 rounded accent-primary" value="${inst.id}" />
      <span class="text-sm text-on-surface">${escapeHtml(inst.name)}</span>
      <span class="text-xs text-on-surface-variant/50">(${inst.blueprintRole ?? inst.blueprintId})</span>
    </label>
  `).join('');

  const bpOptions = blueprints.map(bp => `
    <label class="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" class="team-member-check w-4 h-4 rounded accent-primary" value="${bp.id}" />
      <span class="text-sm text-on-surface">${escapeHtml(bp.role)}</span>
    </label>
  `).join('');

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="create-team-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('agents.teams.modal.title') || 'Create Team'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.teams.modal.nameLabel') || 'Team Name'}
          </label>
          <input type="text" id="team-name-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('agents.teams.modal.namePlaceholder') || 'Enter team name...'}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.teams.modal.strategyLabel') || 'Strategy'}
          </label>
          <select id="team-strategy-select"
                  class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                         border border-outline-variant/30 focus:border-primary outline-none transition">
            <option value="round_robin">${t('agents.teams.strategy.roundRobin') || 'Round Robin'}</option>
            <option value="consensus">${t('agents.teams.strategy.consensus') || 'Consensus'}</option>
            <option value="hierarchy">${t('agents.teams.strategy.hierarchy') || 'Hierarchy'}</option>
          </select>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.teams.modal.membersLabel') || 'Select Members'}
          </label>
          <div class="max-h-40 overflow-y-auto rounded-lg border border-outline-variant/20 p-2 space-y-0.5">
            ${agentOptions || bpOptions || '<p class="text-xs text-on-surface-variant/40 py-2 text-center">No agents available</p>'}
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="team-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('agents.teams.modal.cancel') || 'Cancel'}
          </button>
          <button id="team-modal-submit"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('agents.teams.modal.submit') || 'Create'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderEditTeamModal(): string {
  const team = editTeamModal.team;
  if (!team) return '';

  const agentOptions = instances.map(inst => `
    <label class="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" class="edit-team-member-check w-4 h-4 rounded accent-primary"
             value="${inst.id}" ${team.members.includes(inst.id) ? 'checked' : ''} />
      <span class="text-sm text-on-surface">${escapeHtml(inst.name)}</span>
      <span class="text-xs text-on-surface-variant/50">(${inst.blueprintRole ?? inst.blueprintId})</span>
    </label>
  `).join('');

  const bpOptions = blueprints.map(bp => `
    <label class="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" class="edit-team-member-check w-4 h-4 rounded accent-primary"
             value="${bp.id}" ${team.members.includes(bp.id) ? 'checked' : ''} />
      <span class="text-sm text-on-surface">${escapeHtml(bp.role)}</span>
    </label>
  `).join('');

  const strategyKey = team.strategy?.toLowerCase().replace(/[\s-]/g, '') ?? 'round_robin';

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="edit-team-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('agents.teams.modal.editTitle') || 'Edit Team'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.teams.modal.nameLabel') || 'Team Name'}
          </label>
          <input type="text" id="edit-team-name-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 value="${escapeHtml(team.name)}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.teams.modal.strategyLabel') || 'Strategy'}
          </label>
          <select id="edit-team-strategy-select"
                  class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                         border border-outline-variant/30 focus:border-primary outline-none transition">
            <option value="round_robin" ${strategyKey === 'round_robin' || strategyKey === 'roundrobin' ? 'selected' : ''}>${t('agents.teams.strategy.roundRobin') || 'Round Robin'}</option>
            <option value="consensus" ${strategyKey === 'consensus' ? 'selected' : ''}>${t('agents.teams.strategy.consensus') || 'Consensus'}</option>
            <option value="hierarchy" ${strategyKey === 'hierarchy' ? 'selected' : ''}>${t('agents.teams.strategy.hierarchy') || 'Hierarchy'}</option>
          </select>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.teams.modal.membersLabel') || 'Select Members'}
          </label>
          <div class="max-h-40 overflow-y-auto rounded-lg border border-outline-variant/20 p-2 space-y-0.5">
            ${agentOptions || bpOptions || '<p class="text-xs text-on-surface-variant/40 py-2 text-center">No agents available</p>'}
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="edit-team-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('agents.teams.modal.cancel') || 'Cancel'}
          </button>
          <button id="edit-team-modal-save"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('agents.teams.modal.save') || 'Save'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── P3-15: Route Rules Edit ──
function renderRoutingSection(): string {
  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
      ${routeRules.length > 0 ? `
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-outline-variant/20 bg-surface-container-low">
              <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
                ${t('agents.routing.pattern') || 'Pattern'}
              </th>
              <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
                ${t('agents.routing.agent') || 'Agent'}
              </th>
              <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
                ${t('agents.routing.priority') || 'Priority'}
              </th>
              <th class="text-right px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
                ${t('agents.routing.actions') || 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody>
            ${routeRules.map(rule => `
              <tr class="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/50 transition">
                <td class="px-4 py-3 font-mono text-on-surface text-xs">${escapeHtml(rule.pattern)}</td>
                <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(rule.agent)}</td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary">${rule.priority ?? 0}</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button class="route-edit-btn px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition"
                            data-route-id="${rule.id}">${t('agents.routing.edit') || 'Edit'}</button>
                    <button class="route-delete-btn px-2 py-1 rounded-md text-xs font-medium bg-error/10 text-error hover:bg-error/20 transition"
                            data-route-id="${rule.id}">${t('agents.routing.delete') || 'Delete'}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="p-6 text-center text-sm text-on-surface-variant/50">
          ${t('agents.routing.noRules') || 'No routing rules defined'}
        </div>
      `}
      <div class="px-4 py-3 border-t border-outline-variant/20">
        <button id="add-route-btn"
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14m-7-7h14"/>
          </svg>
          ${t('agents.routing.addRule') || 'Add Rule'}
        </button>
      </div>
    </div>
  `;
}

function renderRouteEditModal(): string {
  const rule = routeEditModal.rule;
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="route-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('agents.routing.modal.title') || 'Routing Rule'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.routing.modal.patternLabel') || 'Pattern'}
          </label>
          <input type="text" id="route-pattern-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('agents.routing.modal.patternPlaceholder') || 'e.g. analysis.*'}"
                 value="${rule ? escapeHtml(rule.pattern) : ''}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.routing.modal.agentLabel') || 'Target Agent'}
          </label>
          <input type="text" id="route-agent-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('agents.routing.modal.agentPlaceholder') || 'Select agent...'}"
                 value="${rule ? escapeHtml(rule.agent) : ''}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('agents.routing.modal.priorityLabel') || 'Priority'}
          </label>
          <input type="number" id="route-priority-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="0"
                 min="0" max="100"
                 value="${rule ? rule.priority ?? 0 : 0}" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="route-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('agents.routing.modal.cancel') || 'Cancel'}
          </button>
          <button id="route-modal-save"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('agents.routing.modal.save') || 'Save'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── P3-16: Delegation Trace View (vertical timeline) ──
function renderDelegationTrace(): string {
  if (delegationEvents.length === 0) {
    return `
      <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 text-center">
        <p class="text-sm text-on-surface-variant/50">${t('agents.delegation.noEvents') || 'No delegation events recorded'}</p>
      </div>
    `;
  }

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div class="relative">
        <!-- Vertical timeline line -->
        <div class="absolute left-[19px] top-3 bottom-3 w-0.5 bg-primary/20"></div>
        <div class="space-y-0">
          ${delegationEvents.map((ev, idx) => {
            const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isLast = idx === delegationEvents.length - 1;
            return `
              <div class="relative flex gap-3 pb-${isLast ? '0' : '4'}">
                <!-- Timeline dot -->
                <div class="relative z-10 flex flex-col items-center shrink-0">
                  <div class="w-[10px] h-[10px] rounded-full bg-primary ring-4 ring-surface-container-lowest mt-1.5"></div>
                  ${!isLast ? `
                    <svg class="w-4 h-4 text-primary/40 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/>
                    </svg>
                  ` : ''}
                </div>
                <!-- Content -->
                <div class="flex-1 min-w-0 rounded-lg border border-outline-variant/15 bg-surface-container-low/50 px-3 py-2">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1.5 text-sm">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/15 text-primary">${escapeHtml(ev.from)}</span>
                      <svg class="w-4 h-4 text-on-surface-variant/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
                      </svg>
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-secondary/15 text-secondary">${escapeHtml(ev.to)}</span>
                    </div>
                    <span class="text-[10px] font-mono text-on-surface-variant/40 shrink-0">${time}</span>
                  </div>
                  <p class="text-xs text-on-surface-variant/60 truncate">${escapeHtml(ev.task)}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ── P3-17: Event Bus Monitor ──
function renderEventBus(): string {
  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
      <div id="event-bus-content">
        ${renderBusEventRows()}
      </div>
    </div>
  `;
}

function renderBusEventRows(): string {
  if (busEvents.length === 0) {
    return `
      <div class="p-6 text-center text-sm text-on-surface-variant/50">
        ${t('agents.eventBus.noEvents') || 'No recent events'}
      </div>
    `;
  }

  return `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-outline-variant/20 bg-surface-container-low">
          <th class="text-left px-4 py-2 text-xs font-label text-on-surface-variant/60 font-medium">
            ${t('agents.eventBus.topic') || 'Topic'}
          </th>
          <th class="text-left px-4 py-2 text-xs font-label text-on-surface-variant/60 font-medium">
            ${t('agents.eventBus.timestamp') || 'Time'}
          </th>
          <th class="text-left px-4 py-2 text-xs font-label text-on-surface-variant/60 font-medium">
            ${t('agents.eventBus.payload') || 'Payload'}
          </th>
        </tr>
      </thead>
      <tbody>
        ${busEvents.slice(0, 20).map(ev => {
          const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const truncatedPayload = ev.payload.length > 80 ? ev.payload.substring(0, 80) + '...' : ev.payload;
          const typeColors: Record<string, { bg: string; text: string; dot: string }> = {
            spawn:   { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
            message: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' },
            error:   { bg: 'bg-error/10', text: 'text-error', dot: 'bg-error' },
            info:    { bg: 'bg-tertiary/10', text: 'text-tertiary', dot: 'bg-tertiary' },
          };
          const evType = ev.type || 'info';
          const tc = typeColors[evType] ?? typeColors.info;
          return `
            <tr class="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/50 transition ${tc.bg}/30">
              <td class="px-4 py-2">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full ${tc.dot} shrink-0"></span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono ${tc.bg} ${tc.text}">${escapeHtml(ev.topic)}</span>
                </div>
              </td>
              <td class="px-4 py-2 text-xs font-mono text-on-surface-variant/60">${time}</td>
              <td class="px-4 py-2 text-xs font-mono text-on-surface-variant/70 truncate max-w-xs">${escapeHtml(truncatedPayload)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderInstancesTable(): string {
  if (instances.length === 0) {
    return `
      <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-8 text-center">
        <div class="w-12 h-12 mx-auto rounded-full bg-surface-container-high flex items-center justify-center mb-3">
          <svg class="w-6 h-6 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"/>
          </svg>
        </div>
        <p class="text-sm text-on-surface-variant/50">${t('agents.noAgents') || 'No running agents'}</p>
      </div>
    `;
  }

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-outline-variant/20 bg-surface-container-low">
            <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
              ${t('agents.instances.name') || 'Name'}
            </th>
            <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
              ${t('agents.instances.blueprint') || 'Blueprint'}
            </th>
            <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
              ${t('agents.instances.status') || 'Status'}
            </th>
            <th class="text-left px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
              ${t('agents.instances.uptime') || 'Uptime'}
            </th>
            <th class="text-right px-4 py-2.5 text-xs font-label text-on-surface-variant/60 font-medium">
              ${t('agents.instances.actions') || 'Actions'}
            </th>
          </tr>
        </thead>
        <tbody>
          ${instances.map(renderInstanceRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderInstanceRow(inst: AgentInstance): string {
  const statusStyles: Record<string, { badge: string; dot: string }> = {
    active:  { badge: 'bg-success/10 text-success', dot: 'bg-success' },
    idle:    { badge: 'bg-warning/10 text-warning', dot: 'bg-warning' },
    standby: { badge: 'bg-on-surface-variant/10 text-on-surface-variant', dot: 'bg-on-surface-variant/50' },
  };
  const style = statusStyles[inst.status] ?? statusStyles.standby;
  const statusLabel = t(`agents.status.${inst.status}`) || inst.status;
  const uptimeStr = formatUptime(inst.uptime);

  return `
    <tr class="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/50 transition">
      <td class="px-4 py-3 font-medium text-on-surface">${escapeHtml(inst.name)}</td>
      <td class="px-4 py-3 text-on-surface-variant/70">
        <span class="px-2 py-0.5 rounded text-xs font-mono bg-surface-container-high">
          ${escapeHtml(inst.blueprintRole ?? inst.blueprintId)}
        </span>
      </td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-label ${style.badge}">
          <span class="w-1.5 h-1.5 rounded-full ${style.dot}"></span>
          ${statusLabel}
        </span>
      </td>
      <td class="px-4 py-3 text-xs text-on-surface-variant/60 font-mono">${uptimeStr}</td>
      <td class="px-4 py-3 text-right">
        <button class="retire-btn px-2.5 py-1 rounded-lg text-xs font-medium
                       bg-error/10 text-error hover:bg-error/20 transition"
                data-agent-id="${inst.id}">
          ${t('agents.retire') || 'Retire'}
        </button>
      </td>
    </tr>
  `;
}

// ── Events ──
function bindEvents(): void {
  if (!container) return;

  // Refresh button
  container.querySelector('#agents-refresh-btn')?.addEventListener('click', () => {
    loadData();
  });

  // Blueprint expand/collapse toggle (P3-13)
  container.querySelectorAll('.blueprint-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const bpId = (el as HTMLElement).dataset.blueprintId;
      if (bpId) {
        expandedBlueprintId = expandedBlueprintId === bpId ? null : bpId;
        renderFull();
        bindEvents();
      }
    });
  });

  // Spawn buttons (collapsed mode)
  container.querySelectorAll('.spawn-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bpId = (btn as HTMLElement).dataset.blueprintId;
      if (bpId) spawnAgent(bpId);
    });
  });

  // Spawn named buttons (expanded mode, P3-13)
  container.querySelectorAll('.spawn-named-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bpId = (btn as HTMLElement).dataset.blueprintId;
      const nameInput = container?.querySelector(`.spawn-name-input[data-blueprint-id="${bpId}"]`) as HTMLInputElement | null;
      const name = nameInput?.value?.trim() || undefined;
      if (bpId) spawnAgent(bpId, name);
    });
  });

  // Retire buttons
  container.querySelectorAll('.retire-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const agentId = (btn as HTMLElement).dataset.agentId;
      if (agentId) retireAgent(agentId);
    });
  });

  // Create Team button (P3-14)
  container.querySelector('#create-team-btn')?.addEventListener('click', () => {
    showCreateTeamModal = true;
    renderFull();
    bindEvents();
  });

  // Team modal events
  container.querySelector('#team-modal-cancel')?.addEventListener('click', () => {
    showCreateTeamModal = false;
    renderFull();
    bindEvents();
  });
  container.querySelector('#create-team-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'create-team-modal-overlay') {
      showCreateTeamModal = false;
      renderFull();
      bindEvents();
    }
  });
  container.querySelector('#team-modal-submit')?.addEventListener('click', () => {
    handleCreateTeam();
  });

  // Edit team buttons (P3-14)
  container.querySelectorAll('.edit-team-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = (btn as HTMLElement).dataset.teamId;
      const team = teams.find(t => t.id === teamId) ?? null;
      if (team) {
        editTeamModal = { show: true, team: { ...team, members: [...team.members] } };
        renderFull();
        bindEvents();
      }
    });
  });

  // Edit team modal events
  container.querySelector('#edit-team-modal-cancel')?.addEventListener('click', () => {
    editTeamModal = { show: false, team: null };
    renderFull();
    bindEvents();
  });
  container.querySelector('#edit-team-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'edit-team-modal-overlay') {
      editTeamModal = { show: false, team: null };
      renderFull();
      bindEvents();
    }
  });
  container.querySelector('#edit-team-modal-save')?.addEventListener('click', () => {
    handleUpdateTeam();
  });

  // Delete team buttons (P3-14)
  container.querySelectorAll('.delete-team-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = (btn as HTMLElement).dataset.teamId;
      if (teamId) deleteTeam(teamId);
    });
  });

  // Routing section toggle (P3-15)
  container.querySelector('#toggle-routing-btn')?.addEventListener('click', () => {
    showRoutingSection = !showRoutingSection;
    renderFull();
    bindEvents();
  });

  // Route edit/delete buttons
  container.querySelectorAll('.route-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ruleId = (btn as HTMLElement).dataset.routeId;
      const rule = routeRules.find(r => r.id === ruleId) ?? null;
      routeEditModal = { show: true, rule };
      renderFull();
      bindEvents();
    });
  });
  container.querySelectorAll('.route-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ruleId = (btn as HTMLElement).dataset.routeId;
      if (ruleId) deleteRoute(ruleId);
    });
  });

  // Add route button
  container.querySelector('#add-route-btn')?.addEventListener('click', () => {
    routeEditModal = { show: true, rule: null };
    renderFull();
    bindEvents();
  });

  // Route modal events
  container.querySelector('#route-modal-cancel')?.addEventListener('click', () => {
    routeEditModal = { show: false, rule: null };
    renderFull();
    bindEvents();
  });
  container.querySelector('#route-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'route-modal-overlay') {
      routeEditModal = { show: false, rule: null };
      renderFull();
      bindEvents();
    }
  });
  container.querySelector('#route-modal-save')?.addEventListener('click', () => {
    handleSaveRoute();
  });

  // Event bus pause/resume button (P3-17)
  container.querySelector('#toggle-bus-pause-btn')?.addEventListener('click', () => {
    eventBusPaused = !eventBusPaused;
    renderFull();
    bindEvents();
  });
}

async function spawnAgent(blueprintId: string, name?: string): Promise<void> {
  try {
    await GatewayClient.call('agents.spawn', { blueprintId, name });
    await loadData();
  } catch (err) {
    console.error('[AgentsPage] Spawn failed:', err);
  }
}

async function retireAgent(agentId: string): Promise<void> {
  const msg = t('agents.retire.confirm') || 'Confirm retiring this agent?';
  if (!confirm(msg)) return;

  try {
    await GatewayClient.call('agents.retire', { agentId });
    await loadData();
  } catch (err) {
    console.error('[AgentsPage] Retire failed:', err);
  }
}

async function handleCreateTeam(): Promise<void> {
  const nameEl = container?.querySelector('#team-name-input') as HTMLInputElement | null;
  const strategyEl = container?.querySelector('#team-strategy-select') as HTMLSelectElement | null;
  const memberChecks = container?.querySelectorAll('.team-member-check:checked') ?? [];

  const name = nameEl?.value?.trim();
  const strategy = strategyEl?.value || 'round_robin';
  const members: string[] = [];
  memberChecks.forEach(el => {
    members.push((el as HTMLInputElement).value);
  });

  if (!name) return;

  try {
    await GatewayClient.call('swarm.createTeam', { name, strategy, members });
  } catch {
    // Add locally for demo
    teams.push({ id: 'team-' + Date.now(), name, strategy, members });
  }

  showCreateTeamModal = false;
  await loadData();
}

async function handleUpdateTeam(): Promise<void> {
  const team = editTeamModal.team;
  if (!team) return;

  const nameEl = container?.querySelector('#edit-team-name-input') as HTMLInputElement | null;
  const strategyEl = container?.querySelector('#edit-team-strategy-select') as HTMLSelectElement | null;
  const memberChecks = container?.querySelectorAll('.edit-team-member-check:checked') ?? [];

  const name = nameEl?.value?.trim();
  const strategy = strategyEl?.value || 'round_robin';
  const members: string[] = [];
  memberChecks.forEach(el => {
    members.push((el as HTMLInputElement).value);
  });

  if (!name) return;

  try {
    await GatewayClient.call('swarm.updateTeam', { teamId: team.id, name, strategy, members });
  } catch {
    // Update locally for demo
    const idx = teams.findIndex(t => t.id === team.id);
    if (idx >= 0) teams[idx] = { ...team, name, strategy, members };
  }

  editTeamModal = { show: false, team: null };
  await loadData();
}

async function deleteTeam(teamId: string): Promise<void> {
  const msg = t('agents.teams.delete.confirm') || 'Confirm deleting this team?';
  if (!confirm(msg)) return;

  try {
    await GatewayClient.call('swarm.deleteTeam', { teamId });
  } catch {
    teams = teams.filter(t => t.id !== teamId);
  }
  await loadData();
}

async function deleteRoute(ruleId: string): Promise<void> {
  const msg = t('agents.routing.delete.confirm') || 'Delete this routing rule?';
  if (!confirm(msg)) return;

  try {
    await GatewayClient.call('flows.routes.update', { ruleId, action: 'delete' });
  } catch {
    routeRules = routeRules.filter(r => r.id !== ruleId);
  }
  renderFull();
  bindEvents();
}

async function handleSaveRoute(): Promise<void> {
  const patternEl = container?.querySelector('#route-pattern-input') as HTMLInputElement | null;
  const agentEl = container?.querySelector('#route-agent-input') as HTMLInputElement | null;
  const priorityEl = container?.querySelector('#route-priority-input') as HTMLInputElement | null;

  const pattern = patternEl?.value?.trim();
  const agent = agentEl?.value?.trim();
  const priority = parseInt(priorityEl?.value || '0', 10) || 0;
  if (!pattern || !agent) return;

  const existingRule = routeEditModal.rule;

  try {
    if (existingRule) {
      await GatewayClient.call('flows.routes.update', { ruleId: existingRule.id, pattern, agent, priority });
    } else {
      await GatewayClient.call('flows.routes.update', { pattern, agent, priority });
    }
  } catch {
    // Update locally for demo
    if (existingRule) {
      const idx = routeRules.findIndex(r => r.id === existingRule.id);
      if (idx >= 0) routeRules[idx] = { ...existingRule, pattern, agent, priority };
    } else {
      routeRules.push({ id: 'route-' + Date.now(), pattern, agent, priority });
    }
  }

  routeEditModal = { show: false, rule: null };
  renderFull();
  bindEvents();
}

// ── Utilities ──
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function swarmIconSvg(): string {
  return `<svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94
         3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12
         21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12
         0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12
         12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681
         2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0
         0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25
         2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25
         0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
  </svg>`;
}

function refreshIconSvg(): string {
  return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"/>
  </svg>`;
}
