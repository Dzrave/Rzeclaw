/**
 * Agent Office Page — Screen 16
 * Pixel-art themed workspace simulation with isometric office layout,
 * agent roster, swarm health metrics, and SIM_TICK animation.
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

// ── Types ──

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  status: 'working' | 'idle' | 'thinking';
  zone: 'strategy' | 'dev' | 'memory';
}

interface SwarmHealth {
  totalTasks: number;
  completedTasks: number;
  avgLatency: number;
}

// ── State ──

let container: HTMLElement | null = null;
let agents: AgentInfo[] = [];
let health: SwarmHealth = { totalTasks: 0, completedTasks: 0, avgLatency: 0 };
let simTick = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeState: (() => void) | undefined;

// ── Status helpers ──

const STATUS_COLORS: Record<AgentInfo['status'], string> = {
  working: 'bg-green-400',
  idle: 'bg-yellow-400',
  thinking: 'bg-blue-400',
};

const STATUS_LABELS: Record<AgentInfo['status'], string> = {
  working: 'Working',
  idle: 'Idle',
  thinking: 'Thinking',
};

const ZONE_COLORS: Record<AgentInfo['zone'], { bg: string; border: string; accent: string; label: string }> = {
  strategy: {
    bg: 'bg-primary/10',
    border: 'border-primary/40',
    accent: 'text-primary',
    label: 'Strategy Room',
  },
  dev: {
    bg: 'bg-secondary/10',
    border: 'border-secondary/40',
    accent: 'text-secondary',
    label: 'Dev Hub',
  },
  memory: {
    bg: 'bg-tertiary/10',
    border: 'border-tertiary/40',
    accent: 'text-tertiary',
    label: 'Memory Vault',
  },
};

const AGENT_AVATARS = ['🤖', '🧠', '⚙️', '🔬', '📡', '🛡️', '🔮', '📊'];

// ── Render ──

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('office');
  simTick = 0;

  // Provide demo agents until real data loads
  agents = buildDemoAgents();
  health = { totalTasks: 42, completedTasks: 37, avgLatency: 120 };

  renderFull();
  bindEvents();
  startSimTick();

  // Listen for connection changes
  unsubscribeState = GatewayClient.onStateChange(() => {
    updateConnectionStatus();
  });

  // Load real agent data
  loadAgents();
}

export function cleanup(): void {
  stopSimTick();
  unsubscribeState?.();
  unsubscribeState = undefined;
  container = null;
  agents = [];
}

// ── Demo data ──

function buildDemoAgents(): AgentInfo[] {
  return [
    { id: 'a1', name: 'Strategist-α', role: 'planner', status: 'working', zone: 'strategy' },
    { id: 'a2', name: 'Analyst-β', role: 'analyst', status: 'thinking', zone: 'strategy' },
    { id: 'a3', name: 'Coder-γ', role: 'developer', status: 'working', zone: 'dev' },
    { id: 'a4', name: 'Builder-δ', role: 'developer', status: 'working', zone: 'dev' },
    { id: 'a5', name: 'Tester-ε', role: 'qa', status: 'idle', zone: 'dev' },
    { id: 'a6', name: 'Archivist-ζ', role: 'memory', status: 'working', zone: 'memory' },
    { id: 'a7', name: 'Indexer-η', role: 'memory', status: 'thinking', zone: 'memory' },
  ];
}

// ── Full page render ──

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col h-full bg-surface">
      <!-- Top bar -->
      <div class="flex items-center gap-3 px-4 py-2 border-b border-outline-variant/20 bg-surface-container-lowest">
        <div class="flex items-center gap-2">
          <span class="text-lg" style="font-family:'Courier New',monospace;image-rendering:pixelated;">🏢</span>
          <h1 class="text-base font-headline font-semibold text-on-surface">
            ${t('office.title') || 'Agent Office'}
          </h1>
        </div>
        <span class="text-xs text-on-surface-variant/50 font-mono">
          ${t('office.subtitle') || 'Workspace Simulation'}
        </span>
      </div>

      <!-- Main content -->
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <!-- Left: Isometric office grid -->
        <div class="flex-1 overflow-auto p-6 flex items-center justify-center">
          <div id="office-grid" class="relative" style="perspective:800px;">
            ${renderIsometricGrid()}
          </div>
        </div>

        <!-- Right panel: Workspace context -->
        <div class="w-72 shrink-0 border-l border-outline-variant/20 bg-surface-container-lowest flex flex-col overflow-hidden">
          <!-- Active agents header -->
          <div class="px-3 py-2.5 border-b border-outline-variant/20">
            <h2 class="text-sm font-semibold text-on-surface">
              ${t('office.activeAgents') || 'Active Agents'}
            </h2>
            <p class="text-xs text-on-surface-variant/60 mt-0.5">
              ${agents.length} ${t('office.online') || 'online'}
            </p>
          </div>

          <!-- Agent list -->
          <div id="agent-list" class="flex-1 overflow-y-auto py-1 px-2 space-y-1">
            ${renderAgentList()}
          </div>

          <!-- Swarm health -->
          <div class="border-t border-outline-variant/20 px-3 py-3">
            <h3 class="text-xs font-semibold text-on-surface-variant mb-2">
              ${t('office.swarmHealth') || 'Swarm Health'}
            </h3>
            <div class="grid grid-cols-3 gap-2">
              ${renderHealthCards()}
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom toolbar -->
      <div class="flex items-center gap-4 px-4 py-2 border-t border-outline-variant/20 bg-surface-container-low">
        <!-- SIM_TICK counter -->
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-on-surface-variant/60">SIM_TICK</span>
          <span id="sim-tick-counter"
                class="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10 min-w-[4rem] text-center tabular-nums">
            ${String(simTick).padStart(6, '0')}
          </span>
        </div>

        <!-- Reorganize button -->
        <button id="reorganize-btn"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-secondary/10 text-secondary hover:bg-secondary/20 transition
                       border border-secondary/20"
                style="font-family:'Courier New',monospace;">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          ${t('office.reorganize') || 'Reorganize Workspace'}
        </button>

        <div class="flex-1"></div>

        <!-- Connection status -->
        <div id="connection-status" class="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
          ${renderConnectionStatus()}
        </div>
      </div>
    </div>
  `;
}

// ── Isometric grid ──

function renderIsometricGrid(): string {
  const zones: AgentInfo['zone'][] = ['strategy', 'dev', 'memory'];

  return `
    <div class="grid grid-cols-3 gap-6"
         style="transform:rotateX(25deg) rotateZ(-15deg);transform-style:preserve-3d;">
      ${zones.map((zone) => {
        const cfg = ZONE_COLORS[zone];
        const zoneAgents = agents.filter(a => a.zone === zone);
        return `
          <div class="office-zone relative w-52 h-60 rounded-xl border-2 ${cfg.border} ${cfg.bg}
                      flex flex-col p-4 transition-all duration-300 hover:scale-105 cursor-pointer
                      shadow-lg"
               data-zone="${zone}"
               style="transform-style:preserve-3d;box-shadow:4px 8px 0 rgba(0,0,0,0.12);">
            <!-- Zone header -->
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-headline font-bold ${cfg.accent}"
                    style="font-family:'Courier New',monospace;">
                ${t('office.zone.' + zone) || cfg.label}
              </span>
              <span class="text-xs ${cfg.accent} px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
                ${zoneAgents.length}
              </span>
            </div>

            <!-- Zone pixel grid floor -->
            <div class="flex-1 relative rounded-lg overflow-hidden"
                 style="background:repeating-conic-gradient(rgba(0,0,0,0.03) 0% 25%, transparent 0% 50%) 0 0/16px 16px;">
              <!-- Agent dots -->
              <div class="flex flex-wrap gap-2 p-2">
                ${zoneAgents.map((a, i) => `
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm
                              bg-surface-container shadow-sm border border-outline-variant/20
                              relative group cursor-default"
                       title="${a.name} (${STATUS_LABELS[a.status]})">
                    <span style="font-size:14px;">${AGENT_AVATARS[i % AGENT_AVATARS.length]}</span>
                    <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${STATUS_COLORS[a.status]}
                                 border border-white ${a.status === 'working' ? 'animate-pulse' : ''}"></span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Zone footer -->
            <div class="mt-2 text-[10px] text-on-surface-variant/50 font-mono text-right">
              ${zoneAgents.filter(a => a.status === 'working').length} active
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Agent list ──

function renderAgentList(): string {
  return agents.map((agent, i) => `
    <div class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-container-high/50
                transition cursor-pointer group">
      <!-- Avatar -->
      <div class="w-7 h-7 rounded-md flex items-center justify-center text-xs
                  bg-surface-container-high border border-outline-variant/20 shrink-0"
           style="image-rendering:pixelated;">
        <span style="font-size:13px;">${AGENT_AVATARS[i % AGENT_AVATARS.length]}</span>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <div class="text-xs font-medium text-on-surface truncate"
             style="font-family:'Courier New',monospace;">
          ${agent.name}
        </div>
        <div class="text-[10px] text-on-surface-variant/50">${agent.role}</div>
      </div>

      <!-- Status -->
      <div class="flex items-center gap-1 shrink-0">
        <span class="w-1.5 h-1.5 rounded-full ${STATUS_COLORS[agent.status]}
                     ${agent.status === 'working' ? 'animate-pulse' : ''}"></span>
        <span class="text-[10px] text-on-surface-variant/50 font-mono">
          ${STATUS_LABELS[agent.status]}
        </span>
      </div>
    </div>
  `).join('');
}

// ── Health cards ──

function renderHealthCards(): string {
  const cards = [
    {
      label: t('office.health.tasks') || 'Tasks',
      value: `${health.completedTasks}/${health.totalTasks}`,
      color: 'text-primary',
    },
    {
      label: t('office.health.uptime') || 'Uptime',
      value: '99.2%',
      color: 'text-secondary',
    },
    {
      label: t('office.health.latency') || 'Latency',
      value: `${health.avgLatency}ms`,
      color: 'text-tertiary',
    },
  ];

  return cards.map(c => `
    <div class="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg bg-surface-container">
      <span class="text-sm font-bold ${c.color} font-mono tabular-nums">${c.value}</span>
      <span class="text-[10px] text-on-surface-variant/50">${c.label}</span>
    </div>
  `).join('');
}

// ── Connection status ──

function renderConnectionStatus(): string {
  const state = GatewayClient.getState();
  const colors: Record<string, string> = {
    connected: 'bg-green-400',
    connecting: 'bg-yellow-400 animate-pulse',
    reconnecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-red-400',
  };
  const labels: Record<string, string> = {
    connected: t('office.connected') || 'Connected',
    connecting: t('office.connecting') || 'Connecting...',
    reconnecting: t('office.reconnecting') || 'Reconnecting...',
    disconnected: t('office.disconnected') || 'Disconnected',
  };

  return `
    <span class="w-2 h-2 rounded-full ${colors[state] || 'bg-gray-400'}"></span>
    <span class="font-mono">${labels[state] || state}</span>
  `;
}

function updateConnectionStatus(): void {
  const el = container?.querySelector('#connection-status');
  if (el) el.innerHTML = renderConnectionStatus();
}

// ── SIM_TICK ──

function startSimTick(): void {
  tickTimer = setInterval(() => {
    simTick++;
    const el = container?.querySelector('#sim-tick-counter');
    if (el) el.textContent = String(simTick).padStart(6, '0');
  }, 500);
}

function stopSimTick(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

// ── Events ──

function bindEvents(): void {
  if (!container) return;

  // Reorganize button - shuffles agent zones
  const reorgBtn = container.querySelector('#reorganize-btn');
  reorgBtn?.addEventListener('click', handleReorganize);

  // Zone click
  const zoneEls = container.querySelectorAll('.office-zone');
  zoneEls.forEach(el => {
    el.addEventListener('click', () => {
      const zone = (el as HTMLElement).dataset.zone;
      if (zone) handleZoneClick(zone as AgentInfo['zone']);
    });
  });
}

function handleReorganize(): void {
  // Shuffle agents into random zones
  const zoneKeys: AgentInfo['zone'][] = ['strategy', 'dev', 'memory'];
  agents = agents.map(a => ({
    ...a,
    zone: zoneKeys[Math.floor(Math.random() * zoneKeys.length)],
    status: (['working', 'idle', 'thinking'] as const)[Math.floor(Math.random() * 3)],
  }));

  // Re-render grid and list
  const gridEl = container?.querySelector('#office-grid');
  if (gridEl) gridEl.innerHTML = renderIsometricGrid();

  const listEl = container?.querySelector('#agent-list');
  if (listEl) listEl.innerHTML = renderAgentList();

  // Re-bind zone click events
  const zoneEls = container?.querySelectorAll('.office-zone');
  zoneEls?.forEach(el => {
    el.addEventListener('click', () => {
      const zone = (el as HTMLElement).dataset.zone;
      if (zone) handleZoneClick(zone as AgentInfo['zone']);
    });
  });
}

function handleZoneClick(zone: AgentInfo['zone']): void {
  // Visual feedback - brief highlight
  const zoneEl = container?.querySelector(`[data-zone="${zone}"]`);
  if (zoneEl) {
    zoneEl.classList.add('ring-2', 'ring-primary');
    setTimeout(() => zoneEl.classList.remove('ring-2', 'ring-primary'), 600);
  }
}

// ── Data loading ──

async function loadAgents(): Promise<void> {
  try {
    const result = await GatewayClient.call<{ agents?: Array<{ id: string; name: string; role?: string; status?: string }> }>(
      'agents.list',
    );

    if (result?.agents && Array.isArray(result.agents)) {
      const zoneKeys: AgentInfo['zone'][] = ['strategy', 'dev', 'memory'];
      agents = result.agents.map((a, i) => ({
        id: a.id || `agent-${i}`,
        name: a.name || `Agent-${i}`,
        role: a.role || 'general',
        status: (a.status as AgentInfo['status']) || 'idle',
        zone: zoneKeys[i % zoneKeys.length],
      }));

      // Re-render with real data
      const gridEl = container?.querySelector('#office-grid');
      if (gridEl) gridEl.innerHTML = renderIsometricGrid();

      const listEl = container?.querySelector('#agent-list');
      if (listEl) listEl.innerHTML = renderAgentList();

      // Update agent count
      const countEl = container?.querySelector('#agent-list')?.parentElement?.previousElementSibling;
      if (countEl) {
        const pEl = countEl.querySelector('p');
        if (pEl) pEl.textContent = `${agents.length} ${t('office.online') || 'online'}`;
      }
    }
  } catch {
    // Gateway not available; keep demo agents
    console.debug('[AgentOffice] Could not load agents, using demo data');
  }
}
