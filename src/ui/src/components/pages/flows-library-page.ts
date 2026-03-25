/**
 * Flows & Skills Library Page — Screen 11
 * Three tabs: Flows, Skills, MCP Servers
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;
let activeTab: 'flows' | 'skills' | 'mcp' | 'routing' = 'flows';

interface FlowItem {
  id: string;
  name: string;
  hint: string;
  successRate: number;
  lastUsed: string;
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  scriptPath: string;
  type: 'custom' | 'evolved';
}

interface McpServer {
  id: string;
  name: string;
  command: string;
  status: 'connected' | 'error' | 'disconnected';
  toolCount: number;
}

interface FlowRoute {
  id: string;
  pattern: string;
  targetFlow: string;
  priority: number;
}

let flows: FlowItem[] = [];
let skills: SkillItem[] = [];
let mcpServers: McpServer[] = [];
let flowRoutes: FlowRoute[] = [];
let showCreateSkillModal = false;
let editSkillModal: { show: boolean; skill: SkillItem | null } = { show: false, skill: null };
let showAddMcpModal = false;
let flowRouteEditModal: { show: boolean; route: FlowRoute | null } = { show: false, route: null };

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('flows');
  loadData();
  renderFull();
}

export function cleanup(): void {
  container = null;
  showCreateSkillModal = false;
  editSkillModal = { show: false, skill: null };
  showAddMcpModal = false;
  flowRouteEditModal = { show: false, route: null };
}

async function loadData(): Promise<void> {
  try {
    const [flowsRes, skillsRes, mcpRes, routesRes] = await Promise.allSettled([
      GatewayClient.call<{ flows: FlowItem[] }>('flows.list', {}),
      GatewayClient.call<{ skills: SkillItem[] }>('skills.list', {}),
      GatewayClient.call<{ servers: McpServer[] }>('mcp.list', {}),
      GatewayClient.call<{ routes: FlowRoute[] }>('flows.routes.list', {}),
    ]);
    if (flowsRes.status === 'fulfilled' && flowsRes.value?.flows) {
      flows = flowsRes.value.flows;
    }
    if (skillsRes.status === 'fulfilled' && skillsRes.value?.skills) {
      skills = skillsRes.value.skills;
    }
    if (mcpRes.status === 'fulfilled' && mcpRes.value?.servers) {
      mcpServers = mcpRes.value.servers;
    }
    if (routesRes.status === 'fulfilled' && routesRes.value?.routes) {
      flowRoutes = routesRes.value.routes;
    }
    renderFull();
  } catch { /* RPC may not be available */ }
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <h1 class="text-xl font-headline font-semibold text-on-surface">
          ${t('common.nav.flowsLibrary') || 'Flows & Skills'}
        </h1>
        <div class="flex items-center gap-2">
          <button id="btn-new-flow" class="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition">
            + New Flow
          </button>
          <button id="btn-new-skill" class="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-sm font-medium hover:bg-secondary/20 transition">
            + New Skill
          </button>
          <button id="btn-add-mcp" class="px-3 py-1.5 rounded-lg bg-tertiary/10 text-tertiary text-sm font-medium hover:bg-tertiary/20 transition">
            + Add MCP Server
          </button>
          <button id="btn-ai-generate" class="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI Generate Flow
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-outline-variant/20 px-6">
        ${renderTab('flows', t('flows.library.tab.flows') || 'Flows', flows.length)}
        ${renderTab('skills', t('flows.library.tab.skills') || 'Skills', skills.length)}
        ${renderTab('mcp', t('flows.library.tab.mcp') || 'MCP Servers', mcpServers.length)}
        ${renderTab('routing', t('flows.library.tab.routing') || 'Routing', flowRoutes.length)}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        ${activeTab === 'flows' ? renderFlowsTab() : ''}
        ${activeTab === 'skills' ? renderSkillsTab() : ''}
        ${activeTab === 'mcp' ? renderMcpTab() : ''}
        ${activeTab === 'routing' ? renderRoutingTab() : ''}
      </div>
    </div>

    ${showCreateSkillModal ? renderCreateSkillModal() : ''}
    ${editSkillModal.show ? renderEditSkillModal() : ''}
    ${showAddMcpModal ? renderAddMcpModal() : ''}
    ${flowRouteEditModal.show ? renderFlowRouteEditModal() : ''}
  `;

  bindEvents();
}

function renderTab(id: string, label: string, count: number): string {
  const isActive = activeTab === id;
  return `
    <button class="tab-btn px-4 py-3 text-sm font-medium border-b-2 transition
                   ${isActive ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40'}"
            data-tab="${id}">
      ${label}
      <span class="ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${isActive ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}">${count}</span>
    </button>
  `;
}

function renderFlowsTab(): string {
  if (flows.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/60">
        <svg class="w-12 h-12 mb-3 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" />
        </svg>
        <p class="text-sm">No flows defined yet. Create one or use AI Generate.</p>
      </div>
    `;
  }

  return `
    <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Hint</th>
            <th class="px-4 py-3 font-medium w-48">Success Rate</th>
            <th class="px-4 py-3 font-medium">Last Used</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/10">
          ${flows.map(f => `
            <tr class="hover:bg-surface-container/50 transition">
              <td class="px-4 py-3 font-medium text-on-surface">${escHtml(f.name)}</td>
              <td class="px-4 py-3 text-on-surface-variant text-xs font-mono truncate max-w-xs">${escHtml(f.hint)}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div class="h-full rounded-full transition-all ${f.successRate >= 80 ? 'bg-success' : f.successRate >= 50 ? 'bg-warning' : 'bg-error'}"
                         style="width: ${f.successRate}%"></div>
                  </div>
                  <span class="text-xs text-on-surface-variant w-10 text-right">${f.successRate}%</span>
                </div>
              </td>
              <td class="px-4 py-3 text-on-surface-variant text-xs">${f.lastUsed || '—'}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button class="flow-edit-btn px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition" data-id="${f.id}">Edit</button>
                  <button class="flow-run-btn px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition" data-id="${f.id}">Run</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSkillsTab(): string {
  const customSkills = skills.filter(s => s.type === 'custom');
  const evolvedSkills = skills.filter(s => s.type === 'evolved');

  if (skills.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/60">
        <svg class="w-12 h-12 mb-3 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17l-5.384-3.19m0 0a2.001 2.001 0 10-.464 3.846L9 17.25V21l3-3h4.5l-2.08-2.08m-3-1.17l5.384-3.19" />
        </svg>
        <p class="text-sm">No skills registered. Add a custom skill to get started.</p>
      </div>
    `;
  }

  return `
    ${customSkills.length > 0 ? `
      <div class="mb-8">
        <h3 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Custom Skills</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${customSkills.map(renderSkillCard).join('')}
        </div>
      </div>
    ` : ''}
    ${evolvedSkills.length > 0 ? `
      <div>
        <h3 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
          Evolved Skills
          <span class="px-1.5 py-0.5 rounded text-xs bg-tertiary/15 text-tertiary">AI</span>
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${evolvedSkills.map(renderSkillCard).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderSkillCard(skill: SkillItem): string {
  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 hover:border-primary/30 transition group">
      <div class="flex items-start justify-between mb-2">
        <h4 class="text-sm font-semibold text-on-surface">${escHtml(skill.name)}</h4>
        ${skill.type === 'evolved' ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-tertiary/15 text-tertiary">evolved</span>' : ''}
      </div>
      <p class="text-xs text-on-surface-variant mb-3 line-clamp-2">${escHtml(skill.description)}</p>
      <p class="text-[11px] font-mono text-on-surface-variant/50 mb-3 truncate">${escHtml(skill.scriptPath)}</p>
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button class="skill-test-btn px-2 py-1 rounded-md bg-success/10 text-success text-xs hover:bg-success/20 transition" data-id="${skill.id}">Test</button>
        <button class="skill-edit-btn px-2 py-1 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20 transition" data-id="${skill.id}">Edit</button>
        <button class="skill-delete-btn px-2 py-1 rounded-md bg-error/10 text-error text-xs hover:bg-error/20 transition" data-id="${skill.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderMcpTab(): string {
  if (mcpServers.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/60">
        <svg class="w-12 h-12 mb-3 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
        </svg>
        <p class="text-sm">No MCP servers configured. Add one to enable external tools.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${mcpServers.map(srv => {
        const statusColor = srv.status === 'connected' ? 'success' : srv.status === 'error' ? 'error' : 'on-surface-variant';
        const statusLabel = srv.status === 'connected' ? 'Connected' : srv.status === 'error' ? 'Error' : 'Disconnected';
        return `
          <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold text-on-surface">${escHtml(srv.name)}</h4>
              <span class="flex items-center gap-1.5 text-xs text-${statusColor}">
                <span class="w-2 h-2 rounded-full bg-${statusColor}"></span>
                ${statusLabel}
              </span>
            </div>
            <p class="text-[11px] font-mono text-on-surface-variant/60 mb-1 truncate">${escHtml(srv.command)}</p>
            <p class="text-xs text-on-surface-variant mb-4">${srv.toolCount} tools</p>
            <div class="flex items-center gap-1">
              <button class="mcp-reconnect-btn px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition" data-id="${srv.id}">Reconnect</button>
              <button class="mcp-remove-btn px-2.5 py-1 rounded-md bg-error/10 text-error text-xs font-medium hover:bg-error/20 transition" data-id="${srv.id}">Remove</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── P3-19: Flow Routing Config Tab ──
function renderRoutingTab(): string {
  return `
    <div class="space-y-4">
      ${flowRoutes.length > 0 ? `
        <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
                <th class="px-4 py-3 font-medium">${t('flows.library.routing.pattern') || 'Trigger Pattern'}</th>
                <th class="px-4 py-3 font-medium">${t('flows.library.routing.targetFlow') || 'Target Flow'}</th>
                <th class="px-4 py-3 font-medium">${t('flows.library.routing.priority') || 'Priority'}</th>
                <th class="px-4 py-3 font-medium text-right">${t('flows.library.routing.actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10">
              ${flowRoutes.map(r => `
                <tr class="hover:bg-surface-container/50 transition">
                  <td class="px-4 py-3 font-mono text-on-surface text-xs">${escHtml(r.pattern)}</td>
                  <td class="px-4 py-3 text-on-surface-variant">${escHtml(r.targetFlow)}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary">${r.priority}</span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <button class="flow-route-edit-btn px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition" data-id="${r.id}">${t('flows.library.routing.edit') || 'Edit'}</button>
                      <button class="flow-route-remove-btn px-2.5 py-1 rounded-md bg-error/10 text-error text-xs font-medium hover:bg-error/20 transition" data-id="${r.id}">${t('flows.library.routing.remove') || 'Remove'}</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/60">
          <svg class="w-12 h-12 mb-3 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <p class="text-sm">${t('flows.library.routing.empty') || 'No flow routing rules defined.'}</p>
        </div>
      `}
      <button id="btn-add-flow-route"
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14m-7-7h14"/>
        </svg>
        ${t('flows.library.routing.addRule') || 'Add Rule'}
      </button>
    </div>
  `;
}

function renderFlowRouteEditModal(): string {
  const route = flowRouteEditModal.route;
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="flow-route-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('flows.library.routing.modal.title') || 'Flow Routing Rule'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.routing.pattern') || 'Trigger Pattern'}
          </label>
          <input type="text" id="flow-route-pattern-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('flows.library.routing.patternPlaceholder') || 'e.g. intent:analyze_*'}"
                 value="${route ? escHtml(route.pattern) : ''}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.routing.targetFlow') || 'Target Flow'}
          </label>
          <select id="flow-route-target-input"
                  class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                         border border-outline-variant/30 focus:border-primary outline-none transition">
            <option value="">${t('flows.library.routing.selectFlow') || 'Select flow...'}</option>
            ${flows.map(f => `<option value="${f.id}" ${route?.targetFlow === f.id ? 'selected' : ''}>${escHtml(f.name)}</option>`).join('')}
          </select>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.routing.priority') || 'Priority'}
          </label>
          <input type="number" id="flow-route-priority-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 min="0" max="100" value="${route ? route.priority : 0}" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="flow-route-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('common.cancel') || 'Cancel'}
          </button>
          <button id="flow-route-modal-save"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('common.save') || 'Save'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── P3-21: Create/Edit Skill Modal ──
function renderCreateSkillModal(): string {
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="create-skill-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('flows.library.skills.create.title') || 'Create Skill'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.skills.create.nameLabel') || 'Skill Name'}
          </label>
          <input type="text" id="skill-name-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('flows.library.skills.create.namePlaceholder') || 'Enter skill name...'}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.skills.create.descLabel') || 'Description'}
          </label>
          <input type="text" id="skill-desc-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('flows.library.skills.create.descPlaceholder') || 'Describe what this skill does...'}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.skills.create.schemaLabel') || 'Tool Schema (JSON)'}
          </label>
          <textarea id="skill-schema-input"
                    class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                           border border-outline-variant/30 focus:border-primary outline-none transition resize-y"
                    rows="6"
                    placeholder='${t('flows.library.skills.create.schemaPlaceholder') || '{\n  "type": "object",\n  "properties": {}\n}'}'></textarea>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="skill-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('flows.library.skills.create.cancel') || 'Cancel'}
          </button>
          <button id="skill-modal-submit"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('flows.library.skills.create.submit') || 'Create'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderEditSkillModal(): string {
  const skill = editSkillModal.skill;
  if (!skill) return '';
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="edit-skill-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('flows.library.skills.edit.title') || 'Edit Skill'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.skills.create.nameLabel') || 'Skill Name'}
          </label>
          <input type="text" id="edit-skill-name-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 value="${escHtml(skill.name)}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.skills.create.descLabel') || 'Description'}
          </label>
          <input type="text" id="edit-skill-desc-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 value="${escHtml(skill.description)}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.skills.create.schemaLabel') || 'Tool Schema (JSON)'}
          </label>
          <textarea id="edit-skill-schema-input"
                    class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                           border border-outline-variant/30 focus:border-primary outline-none transition resize-y"
                    rows="6"
                    placeholder='${t('flows.library.skills.create.schemaPlaceholder') || '{\n  "type": "object",\n  "properties": {}\n}'}'>${escHtml(skill.scriptPath)}</textarea>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="edit-skill-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('flows.library.skills.create.cancel') || 'Cancel'}
          </button>
          <button id="edit-skill-modal-save"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('flows.library.skills.edit.save') || 'Save'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── P3-22: Add MCP Server Modal ──
function renderAddMcpModal(): string {
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" id="add-mcp-modal-overlay">
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 class="text-lg font-headline font-semibold text-on-surface">
          ${t('flows.library.mcp.create.title') || 'Add MCP Server'}
        </h3>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.mcp.create.nameLabel') || 'Server Name'}
          </label>
          <input type="text" id="mcp-name-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('flows.library.mcp.create.namePlaceholder') || 'Enter server name...'}" />
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.mcp.create.transportLabel') || 'Transport'}
          </label>
          <select id="mcp-transport-select"
                  class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                         border border-outline-variant/30 focus:border-primary outline-none transition">
            <option value="stdio">${t('flows.library.mcp.create.transportStdio') || 'stdio'}</option>
            <option value="sse">${t('flows.library.mcp.create.transportSse') || 'SSE (Server-Sent Events)'}</option>
          </select>
        </div>

        <div class="space-y-2" id="mcp-command-field">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.mcp.create.commandLabel') || 'Command'}
          </label>
          <input type="text" id="mcp-command-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('flows.library.mcp.create.commandPlaceholder') || 'e.g. npx -y @modelcontextprotocol/server-example'}" />
        </div>

        <div class="space-y-2" id="mcp-url-field">
          <label class="block text-xs font-label font-semibold text-on-surface-variant/60 uppercase tracking-wider">
            ${t('flows.library.mcp.create.urlLabel') || 'URL'}
          </label>
          <input type="text" id="mcp-url-input"
                 class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                        border border-outline-variant/30 focus:border-primary outline-none transition"
                 placeholder="${t('flows.library.mcp.create.urlPlaceholder') || 'e.g. http://localhost:3000/sse'}" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="mcp-modal-cancel"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant
                         bg-surface-container-high hover:bg-surface-container-highest transition">
            ${t('flows.library.mcp.create.cancel') || 'Cancel'}
          </button>
          <button id="mcp-modal-submit"
                  class="px-4 py-2 rounded-lg text-sm font-medium text-on-primary
                         bg-primary hover:bg-primary/90 transition">
            ${t('flows.library.mcp.create.submit') || 'Add Server'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindEvents(): void {
  if (!container) return;

  container.querySelectorAll('.tab-btn').forEach(el => {
    el.addEventListener('click', () => {
      activeTab = (el as HTMLElement).dataset.tab as typeof activeTab;
      renderFull();
    });
  });

  container.querySelector('#btn-new-flow')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'flow-editor' } }));
  });

  container.querySelector('#btn-ai-generate')?.addEventListener('click', async () => {
    const hint = prompt('Describe the flow you want to generate:');
    if (hint) {
      try {
        await GatewayClient.call('flows.aiGenerate', { hint });
        await loadData();
      } catch (e) {
        console.error('AI generate failed:', e);
      }
    }
  });

  container.querySelectorAll('.flow-edit-btn').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id;
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'flow-editor', flowId: id } }));
    });
  });

  container.querySelectorAll('.flow-run-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      try {
        await GatewayClient.call('flows.run', { flowId: id });
        window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'flow-monitor' } }));
      } catch (e) {
        console.error('Flow run failed:', e);
      }
    });
  });

  // ── P3-21: Skill CRUD events ──
  container.querySelector('#btn-new-skill')?.addEventListener('click', () => {
    showCreateSkillModal = true;
    renderFull();
  });

  container.querySelectorAll('.skill-test-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      try {
        const result = await GatewayClient.call<{ output: string }>('skills.test', { skillId: id });
        alert(`Test result: ${result?.output ?? 'OK'}`);
      } catch (e) {
        alert(`Test failed: ${e instanceof Error ? e.message : e}`);
      }
    });
  });

  container.querySelectorAll('.skill-edit-btn').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id;
      const skill = skills.find(s => s.id === id) ?? null;
      if (skill) {
        editSkillModal = { show: true, skill: { ...skill } };
        renderFull();
      }
    });
  });

  container.querySelectorAll('.skill-delete-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      if (confirm(t('common.confirm.delete') || 'Are you sure?')) {
        try {
          await GatewayClient.call('skills.delete', { skillId: id });
          await loadData();
        } catch (e) {
          console.error('Delete failed:', e);
        }
      }
    });
  });

  // Create Skill modal events
  container.querySelector('#skill-modal-cancel')?.addEventListener('click', () => {
    showCreateSkillModal = false;
    renderFull();
  });
  container.querySelector('#create-skill-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'create-skill-modal-overlay') {
      showCreateSkillModal = false;
      renderFull();
    }
  });
  container.querySelector('#skill-modal-submit')?.addEventListener('click', async () => {
    const name = (container?.querySelector('#skill-name-input') as HTMLInputElement)?.value?.trim();
    const description = (container?.querySelector('#skill-desc-input') as HTMLInputElement)?.value?.trim();
    const schema = (container?.querySelector('#skill-schema-input') as HTMLTextAreaElement)?.value?.trim();
    if (!name) return;
    try {
      await GatewayClient.call('skills.create', { name, description, toolSchema: schema });
    } catch {
      skills.push({ id: 'skill-' + Date.now(), name, description: description || '', scriptPath: schema || '', type: 'custom' });
    }
    showCreateSkillModal = false;
    await loadData();
  });

  // Edit Skill modal events
  container.querySelector('#edit-skill-modal-cancel')?.addEventListener('click', () => {
    editSkillModal = { show: false, skill: null };
    renderFull();
  });
  container.querySelector('#edit-skill-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'edit-skill-modal-overlay') {
      editSkillModal = { show: false, skill: null };
      renderFull();
    }
  });
  container.querySelector('#edit-skill-modal-save')?.addEventListener('click', async () => {
    const skill = editSkillModal.skill;
    if (!skill) return;
    const name = (container?.querySelector('#edit-skill-name-input') as HTMLInputElement)?.value?.trim();
    const description = (container?.querySelector('#edit-skill-desc-input') as HTMLInputElement)?.value?.trim();
    const schema = (container?.querySelector('#edit-skill-schema-input') as HTMLTextAreaElement)?.value?.trim();
    if (!name) return;
    try {
      await GatewayClient.call('skills.update', { skillId: skill.id, name, description, toolSchema: schema });
    } catch {
      const idx = skills.findIndex(s => s.id === skill.id);
      if (idx >= 0) skills[idx] = { ...skill, name, description: description || '', scriptPath: schema || '' };
    }
    editSkillModal = { show: false, skill: null };
    await loadData();
  });

  // ── P3-22: MCP Server CRUD events ──
  container.querySelector('#btn-add-mcp')?.addEventListener('click', () => {
    showAddMcpModal = true;
    renderFull();
  });

  container.querySelectorAll('.mcp-reconnect-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      try {
        await GatewayClient.call('mcp.servers.reconnect', { serverId: id });
        await loadData();
      } catch (e) {
        console.error('Reconnect failed:', e);
      }
    });
  });

  container.querySelectorAll('.mcp-remove-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      if (confirm(t('common.confirm.delete') || 'Are you sure?')) {
        try {
          await GatewayClient.call('mcp.servers.remove', { serverId: id });
        } catch {
          mcpServers = mcpServers.filter(s => s.id !== id);
        }
        await loadData();
      }
    });
  });

  // Add MCP modal events
  container.querySelector('#mcp-modal-cancel')?.addEventListener('click', () => {
    showAddMcpModal = false;
    renderFull();
  });
  container.querySelector('#add-mcp-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'add-mcp-modal-overlay') {
      showAddMcpModal = false;
      renderFull();
    }
  });

  // Transport toggle for command/url fields
  container.querySelector('#mcp-transport-select')?.addEventListener('change', () => {
    const transport = (container?.querySelector('#mcp-transport-select') as HTMLSelectElement)?.value;
    const cmdField = container?.querySelector('#mcp-command-field') as HTMLElement | null;
    const urlField = container?.querySelector('#mcp-url-field') as HTMLElement | null;
    if (cmdField) cmdField.style.display = transport === 'stdio' ? '' : 'none';
    if (urlField) urlField.style.display = transport === 'sse' ? '' : 'none';
  });
  // Initialize visibility
  const transportEl = container.querySelector('#mcp-transport-select') as HTMLSelectElement | null;
  if (transportEl) {
    const cmdField = container.querySelector('#mcp-command-field') as HTMLElement | null;
    const urlField = container.querySelector('#mcp-url-field') as HTMLElement | null;
    if (cmdField) cmdField.style.display = transportEl.value === 'stdio' ? '' : 'none';
    if (urlField) urlField.style.display = transportEl.value === 'sse' ? '' : 'none';
  }

  container.querySelector('#mcp-modal-submit')?.addEventListener('click', async () => {
    const name = (container?.querySelector('#mcp-name-input') as HTMLInputElement)?.value?.trim();
    const transport = (container?.querySelector('#mcp-transport-select') as HTMLSelectElement)?.value || 'stdio';
    const command = (container?.querySelector('#mcp-command-input') as HTMLInputElement)?.value?.trim();
    const url = (container?.querySelector('#mcp-url-input') as HTMLInputElement)?.value?.trim();
    if (!name) return;
    const connectionStr = transport === 'stdio' ? command : url;
    try {
      await GatewayClient.call('mcp.servers.add', { name, transport, command: connectionStr, url: connectionStr });
    } catch {
      mcpServers.push({ id: 'mcp-' + Date.now(), name, command: connectionStr || '', status: 'disconnected', toolCount: 0 });
    }
    showAddMcpModal = false;
    await loadData();
  });

  // ── P3-19: Flow Routing events ──
  container.querySelector('#btn-add-flow-route')?.addEventListener('click', () => {
    flowRouteEditModal = { show: true, route: null };
    renderFull();
  });

  container.querySelectorAll('.flow-route-edit-btn').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id;
      const route = flowRoutes.find(r => r.id === id) ?? null;
      flowRouteEditModal = { show: true, route };
      renderFull();
    });
  });

  container.querySelectorAll('.flow-route-remove-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      if (confirm(t('common.confirm.delete') || 'Are you sure?')) {
        try {
          await GatewayClient.call('flows.routes.update', { routeId: id, action: 'delete' });
        } catch {
          flowRoutes = flowRoutes.filter(r => r.id !== id);
        }
        renderFull();
      }
    });
  });

  // Flow route modal events
  container.querySelector('#flow-route-modal-cancel')?.addEventListener('click', () => {
    flowRouteEditModal = { show: false, route: null };
    renderFull();
  });
  container.querySelector('#flow-route-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'flow-route-modal-overlay') {
      flowRouteEditModal = { show: false, route: null };
      renderFull();
    }
  });
  container.querySelector('#flow-route-modal-save')?.addEventListener('click', async () => {
    const pattern = (container?.querySelector('#flow-route-pattern-input') as HTMLInputElement)?.value?.trim();
    const targetFlow = (container?.querySelector('#flow-route-target-input') as HTMLSelectElement)?.value?.trim();
    const priority = parseInt((container?.querySelector('#flow-route-priority-input') as HTMLInputElement)?.value || '0', 10) || 0;
    if (!pattern || !targetFlow) return;
    const existing = flowRouteEditModal.route;
    try {
      await GatewayClient.call('flows.routes.update', {
        routeId: existing?.id,
        pattern, targetFlow, priority,
      });
    } catch {
      if (existing) {
        const idx = flowRoutes.findIndex(r => r.id === existing.id);
        if (idx >= 0) flowRoutes[idx] = { ...existing, pattern, targetFlow, priority };
      } else {
        flowRoutes.push({ id: 'fr-' + Date.now(), pattern, targetFlow, priority });
      }
    }
    flowRouteEditModal = { show: false, route: null };
    await loadData();
  });
}
