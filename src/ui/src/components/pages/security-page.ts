/**
 * Security & Permissions Page — Screen 08
 * Dangerous command rules, permission scopes, audit log, system integrity
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;
let activeSection: 'rules' | 'permissions' | 'audit' | 'integrity' = 'rules';

interface DangerousRule {
  id: string;
  pattern: string;
  description: string;
  mode: 'block' | 'confirm' | 'dryrun';
  builtIn: boolean;
  enabled: boolean;
}

interface PermissionScope {
  id: string;
  scope: string;
  policy: 'granted' | 'denied' | 'ask';
  sessionGrant: boolean;
  scheduledWindow?: { start: string; end: string; remaining?: number };
  riskScore?: number;
}

interface ProtectedPid {
  pid: number;
  process: string;
  protection: 'block' | 'confirm';
}

interface CategoryPolicy {
  category: 'bash' | 'write' | 'process';
  mode: 'block' | 'confirm' | 'allow';
  ruleCount: number;
}

interface AuditPipelineEntry {
  stage: string;
  result: 'pass' | 'fail' | 'warn';
  detail: string;
  timestamp: string;
}

interface AuditEntry {
  id: string;
  source: string;
  action: string;
  riskLevel: 'low' | 'medium' | 'high';
  timestamp: string;
  details: string;
}

interface IntegrityCheck {
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface PermissionRequest {
  id: string;
  scope: string;
  reason: string;
  duration: number;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
}

let rules: DangerousRule[] = [];
let permissions: PermissionScope[] = [];
let auditLog: AuditEntry[] = [];
let integrityChecks: IntegrityCheck[] = [];
let auditFilterRisk = '';
let auditFilterSource = '';
let testRuleInput = '';
let countdownTimers: ReturnType<typeof setInterval>[] = [];
let showAddRuleForm = false;
let editingRuleId: string | null = null;
let ruleFormPattern = '';
let ruleFormDescription = '';
let ruleFormMode: 'block' | 'confirm' | 'dryrun' = 'confirm';
let permissionRequests: PermissionRequest[] = [];
let reqFormScope = '';
let reqFormReason = '';
let reqFormDuration = 30;
let protectedPids: ProtectedPid[] = [];
let categoryPolicies: CategoryPolicy[] = [
  { category: 'bash', mode: 'confirm', ruleCount: 0 },
  { category: 'write', mode: 'confirm', ruleCount: 0 },
  { category: 'process', mode: 'block', ruleCount: 0 },
];
let auditPipeline: AuditPipelineEntry[] = [];
let editingScopeId: string | null = null;
let editingScopePolicy: string = '';

const SECTIONS = [
  { id: 'rules', labelKey: 'security.dangerousCommands.title' },
  { id: 'permissions', labelKey: 'security.permissions.title' },
  { id: 'audit', labelKey: 'security.audit.title' },
  { id: 'integrity', labelKey: 'security.integrity.title' },
];

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('security');
  loadData();
  renderFull();
}

export function cleanup(): void {
  container = null;
  countdownTimers.forEach(t => clearInterval(t));
  countdownTimers = [];
}

async function loadData(): Promise<void> {
  try {
    const [rulesRes, permsRes, auditRes, intRes] = await Promise.allSettled([
      GatewayClient.call<{ rules: DangerousRule[] }>('security.rules', {}),
      GatewayClient.call<{ permissions: PermissionScope[] }>('security.permissions', {}),
      GatewayClient.call<{ log: AuditEntry[] }>('security.auditLog', {}),
      GatewayClient.call<{ checks: IntegrityCheck[] }>('security.integrityCheck', {}),
    ]);
    if (rulesRes.status === 'fulfilled' && rulesRes.value?.rules) {
      rules = rulesRes.value.rules;
      const val = rulesRes.value as Record<string, unknown>;
      if (val.protectedPids) protectedPids = val.protectedPids as ProtectedPid[];
      if (val.categoryPolicies) categoryPolicies = val.categoryPolicies as CategoryPolicy[];
    }
    if (permsRes.status === 'fulfilled' && permsRes.value?.permissions) {
      permissions = permsRes.value.permissions;
      const val = permsRes.value as Record<string, unknown>;
      if (val.auditPipeline) auditPipeline = val.auditPipeline as AuditPipelineEntry[];
    }
    if (auditRes.status === 'fulfilled' && auditRes.value?.log) auditLog = auditRes.value.log;
    if (intRes.status === 'fulfilled' && intRes.value?.checks) integrityChecks = intRes.value.checks;
    renderFull();
  } catch { /* RPC may not be available */ }
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex h-full">
      <!-- Sidebar -->
      <div class="w-52 shrink-0 border-r border-outline-variant/20 bg-surface-container-lowest py-4 px-3">
        <h2 class="px-3 mb-3 text-sm font-headline font-semibold text-on-surface">
          ${t('security.title') || 'Security & Permissions'}
        </h2>
        <nav class="space-y-0.5">
          ${SECTIONS.map(s => {
            const isActive = s.id === activeSection;
            return `
              <button class="section-btn w-full text-left px-3 py-2 rounded-lg text-sm transition
                             ${isActive ? 'bg-primary/12 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-high'}"
                      data-section="${s.id}">
                ${t(s.labelKey) || s.id}
              </button>
            `;
          }).join('')}
        </nav>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="max-w-4xl">
          ${renderActiveSection()}
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function renderActiveSection(): string {
  switch (activeSection) {
    case 'rules': return renderRulesSection();
    case 'permissions': return renderPermissionsSection();
    case 'audit': return renderAuditSection();
    case 'integrity': return renderIntegritySection();
    default: return '';
  }
}

function renderRulesSection(): string {
  const builtInRules = rules.filter(r => r.builtIn);
  const customRules = rules.filter(r => !r.builtIn);

  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-4">
      ${t('security.dangerousCommands.title') || 'Dangerous Command Rules'}
    </h3>

    <!-- Mode legend -->
    <div class="flex items-center gap-4 mb-4 text-xs text-on-surface-variant/60">
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-error"></span> ${t('security.dangerousCommands.mode.block') || 'Block'}</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-warning"></span> ${t('security.dangerousCommands.mode.confirm') || 'Confirm'}</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-primary"></span> ${t('security.dangerousCommands.mode.dryrun') || 'Dry Run'}</span>
    </div>

    <!-- Built-in Rules -->
    <div class="mb-6">
      <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
        ${t('security.dangerousCommands.builtIn') || 'Built-in Rules'} (${builtInRules.length})
      </h4>
      <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
              <th class="px-4 py-2.5 font-medium">${t('security.dangerousCommands.pattern') || 'Pattern'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.dangerousCommands.description') || 'Description'}</th>
              <th class="px-4 py-2.5 font-medium w-28">${t('security.dangerousCommands.mode') || 'Mode'}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/10">
            ${builtInRules.map(r => renderRuleRow(r)).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Custom Rules -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
          ${t('security.dangerousCommands.custom') || 'Custom Rules'} (${customRules.length})
        </h4>
        <button id="btn-add-rule" class="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition">
          ${t('security.dangerousCommands.addRule') || '+ Add Rule'}
        </button>
      </div>

      <!-- Add/Edit Rule Form -->
      ${showAddRuleForm ? `
        <div class="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-4">
          <h5 class="text-sm font-semibold text-on-surface mb-3">
            ${editingRuleId
              ? (t('security.dangerousCommands.editRuleTitle') || 'Edit Custom Rule')
              : (t('security.dangerousCommands.addRuleTitle') || 'Add Custom Rule')}
          </h5>
          <div class="space-y-3">
            <div>
              <label class="text-xs text-on-surface-variant mb-1 block">${t('security.dangerousCommands.pattern') || 'Pattern'}</label>
              <input id="rule-form-pattern" type="text"
                     class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                            border border-outline-variant/30 focus:border-primary outline-none"
                     placeholder="${t('security.dangerousCommands.patternPlaceholder') || 'e.g. rm\\\\s+-rf\\\\s+/'}"
                     value="${escHtml(ruleFormPattern)}" />
            </div>
            <div>
              <label class="text-xs text-on-surface-variant mb-1 block">${t('security.dangerousCommands.description') || 'Description'}</label>
              <input id="rule-form-description" type="text"
                     class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                            border border-outline-variant/30 focus:border-primary outline-none"
                     placeholder="${t('security.dangerousCommands.descriptionPlaceholder') || 'Describe what this rule catches...'}"
                     value="${escHtml(ruleFormDescription)}" />
            </div>
            <div>
              <label class="text-xs text-on-surface-variant mb-1 block">${t('security.dangerousCommands.action') || 'Action'}</label>
              <select id="rule-form-mode"
                      class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                             border border-outline-variant/30 focus:border-primary outline-none">
                <option value="block" ${ruleFormMode === 'block' ? 'selected' : ''}>${t('security.dangerousCommands.mode.block') || 'Block'}</option>
                <option value="confirm" ${ruleFormMode === 'confirm' ? 'selected' : ''}>${t('security.dangerousCommands.mode.confirm') || 'Confirm'}</option>
                <option value="dryrun" ${ruleFormMode === 'dryrun' ? 'selected' : ''}>${t('security.dangerousCommands.mode.dryrun') || 'Dry Run'}</option>
              </select>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <button id="btn-save-rule" class="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition">
                ${t('security.dangerousCommands.save') || 'Save Rule'}
              </button>
              <button id="btn-cancel-rule" class="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium hover:bg-surface-container transition">
                ${t('security.dangerousCommands.cancel') || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      ${customRules.length > 0 ? `
        <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
                <th class="px-4 py-2.5 font-medium">${t('security.dangerousCommands.pattern') || 'Pattern'}</th>
                <th class="px-4 py-2.5 font-medium">${t('security.dangerousCommands.description') || 'Description'}</th>
                <th class="px-4 py-2.5 font-medium w-28">${t('security.dangerousCommands.mode') || 'Mode'}</th>
                <th class="px-4 py-2.5 font-medium w-20">${t('security.dangerousCommands.enabled') || 'Enabled'}</th>
                <th class="px-4 py-2.5 font-medium w-24">${t('security.dangerousCommands.action') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10">
              ${customRules.map(r => renderCustomRuleRow(r)).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="text-center py-6 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20">
          ${t('security.dangerousCommands.noCustomRules') || 'No custom rules defined.'}
        </div>
      `}
    </div>

    <!-- Command Policy Overview Cards (P6-01) -->
    <div class="mb-6">
      <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
        ${t('security.dangerousCommands.policyCards') || 'Command Policy Overview'}
      </h4>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${categoryPolicies.map(cp => {
          const modeColors: Record<string, { bg: string; border: string; text: string; indicator: string }> = {
            block: { bg: 'bg-error/8', border: 'border-error/30', text: 'text-error', indicator: 'bg-error' },
            confirm: { bg: 'bg-warning/8', border: 'border-warning/30', text: 'text-warning', indicator: 'bg-warning' },
            allow: { bg: 'bg-success/8', border: 'border-success/30', text: 'text-success', indicator: 'bg-success' },
          };
          const c = modeColors[cp.mode] || modeColors.confirm;
          const catLabel = t(`security.dangerousCommands.category.${cp.category}`) || cp.category;
          const modeLabel = cp.mode === 'allow' ? 'Allow' : (t(`security.dangerousCommands.mode.${cp.mode}`) || cp.mode);
          return `
            <div class="rounded-xl border ${c.border} ${c.bg} p-4">
              <div class="flex items-center justify-between mb-2">
                <h5 class="text-sm font-semibold text-on-surface">${catLabel}</h5>
                <span class="w-3 h-3 rounded-full ${c.indicator}"></span>
              </div>
              <p class="text-lg font-bold ${c.text} mb-1">${modeLabel}</p>
              <p class="text-[11px] text-on-surface-variant/60">${cp.ruleCount} rules active</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Protected PIDs Table (P6-01) -->
    <div class="mb-6">
      <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
        ${t('security.dangerousCommands.protectedPids') || 'Protected PIDs'}
      </h4>
      ${protectedPids.length === 0 ? `
        <div class="text-center py-4 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20">
          ${t('security.dangerousCommands.protectedPids.empty') || 'No protected PIDs configured.'}
        </div>
      ` : `
        <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
                <th class="px-4 py-2.5 font-medium w-24">${t('security.dangerousCommands.protectedPids.pid') || 'PID'}</th>
                <th class="px-4 py-2.5 font-medium">${t('security.dangerousCommands.protectedPids.process') || 'Process'}</th>
                <th class="px-4 py-2.5 font-medium w-32">${t('security.dangerousCommands.protectedPids.protection') || 'Protection'}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10">
              ${protectedPids.map(p => {
                const protColor = p.protection === 'block' ? 'bg-error/15 text-error' : 'bg-warning/15 text-warning';
                const protLabel = t(`security.dangerousCommands.mode.${p.protection}`) || p.protection;
                return `
                  <tr class="hover:bg-surface-container/50 transition">
                    <td class="px-4 py-2.5 font-mono text-xs text-on-surface">${p.pid}</td>
                    <td class="px-4 py-2.5 text-on-surface text-xs">${escHtml(p.process)}</td>
                    <td class="px-4 py-2.5">
                      <span class="px-2 py-0.5 rounded-full text-[11px] ${protColor}">${protLabel}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Test Rule -->
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <h4 class="text-sm font-semibold text-on-surface mb-2">${t('security.dangerousCommands.testRule') || 'Test Rule'}</h4>
      <div class="flex gap-2">
        <input id="test-rule-input" type="text"
               class="flex-1 px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface font-mono
                      border border-outline-variant/30 focus:border-primary outline-none"
               placeholder="${t('security.dangerousCommands.testInput') || 'Enter command to test...'}"
               value="${escHtml(testRuleInput)}" />
        <button id="btn-test-rule" class="px-4 py-2 rounded-lg bg-warning/10 text-warning text-sm font-medium hover:bg-warning/20 transition">
          Test
        </button>
      </div>
      <div id="test-rule-result" class="mt-2 text-xs"></div>
    </div>
  `;
}

function renderRuleRow(rule: DangerousRule, showToggle = false): string {
  const modeColors: Record<string, string> = {
    block: 'bg-error/15 text-error',
    confirm: 'bg-warning/15 text-warning',
    dryrun: 'bg-primary/15 text-primary',
  };
  const modeLabel = t(`security.dangerousCommands.mode.${rule.mode}`) || rule.mode;

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface">${escHtml(rule.pattern)}</td>
      <td class="px-4 py-2.5 text-on-surface-variant text-xs">${escHtml(rule.description)}</td>
      <td class="px-4 py-2.5">
        ${rule.builtIn ? `
          <span class="px-2 py-0.5 rounded-full text-[11px] ${modeColors[rule.mode]}">${modeLabel}</span>
        ` : `
          <select class="rule-mode-select px-2 py-1 rounded-md bg-surface-container-high text-xs border border-outline-variant/30 text-on-surface" data-id="${rule.id}">
            <option value="block" ${rule.mode === 'block' ? 'selected' : ''}>${t('security.dangerousCommands.mode.block') || 'Block'}</option>
            <option value="confirm" ${rule.mode === 'confirm' ? 'selected' : ''}>${t('security.dangerousCommands.mode.confirm') || 'Confirm'}</option>
            <option value="dryrun" ${rule.mode === 'dryrun' ? 'selected' : ''}>${t('security.dangerousCommands.mode.dryrun') || 'Dry Run'}</option>
          </select>
        `}
      </td>
      ${showToggle ? `
        <td class="px-4 py-2.5">
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" class="rule-toggle sr-only peer" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''} />
            <div class="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </td>
      ` : ''}
    </tr>
  `;
}

function renderCustomRuleRow(rule: DangerousRule): string {
  const modeColors: Record<string, string> = {
    block: 'bg-error/15 text-error',
    confirm: 'bg-warning/15 text-warning',
    dryrun: 'bg-primary/15 text-primary',
  };

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface">${escHtml(rule.pattern)}</td>
      <td class="px-4 py-2.5 text-on-surface-variant text-xs">${escHtml(rule.description)}</td>
      <td class="px-4 py-2.5">
        <select class="rule-mode-select px-2 py-1 rounded-md bg-surface-container-high text-xs border border-outline-variant/30 text-on-surface" data-id="${rule.id}">
          <option value="block" ${rule.mode === 'block' ? 'selected' : ''}>${t('security.dangerousCommands.mode.block') || 'Block'}</option>
          <option value="confirm" ${rule.mode === 'confirm' ? 'selected' : ''}>${t('security.dangerousCommands.mode.confirm') || 'Confirm'}</option>
          <option value="dryrun" ${rule.mode === 'dryrun' ? 'selected' : ''}>${t('security.dangerousCommands.mode.dryrun') || 'Dry Run'}</option>
        </select>
      </td>
      <td class="px-4 py-2.5">
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" class="rule-toggle sr-only peer" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''} />
          <div class="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </td>
      <td class="px-4 py-2.5">
        <div class="flex items-center gap-1">
          <button class="btn-edit-rule px-2 py-1 rounded-md text-[11px] bg-primary/10 text-primary hover:bg-primary/20 transition" data-id="${rule.id}">
            ${t('security.dangerousCommands.edit') || 'Edit'}
          </button>
          <button class="btn-delete-rule px-2 py-1 rounded-md text-[11px] bg-error/10 text-error hover:bg-error/20 transition" data-id="${rule.id}">
            ${t('security.dangerousCommands.delete') || 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderPermissionsSection(): string {
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-4">
      ${t('security.permissions.title') || 'Permission Scopes'}
    </h3>
    ${permissions.length === 0 ? `
      <div class="text-center py-8 text-on-surface-variant/50 text-sm">No permission scopes configured.</div>
    ` : `
      <div class="rounded-xl border border-outline-variant/20 overflow-hidden mb-6">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
              <th class="px-4 py-2.5 font-medium">${t('security.permissions.scope') || 'Scope'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.permissions.policy') || 'Policy'}</th>
              <th class="px-4 py-2.5 font-medium w-20">${t('security.permissions.riskScore') || 'Risk'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.permissions.sessionGrant') || 'Session Grant'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.permissions.scheduledWindow') || 'Scheduled Window'}</th>
              <th class="px-4 py-2.5 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/10">
            ${permissions.map(renderPermissionRow).join('')}
          </tbody>
        </table>
      </div>
    `}

    <!-- Audit Pipeline Visualization (P6-02) -->
    <div class="mb-6">
      <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
        ${t('security.permissions.auditPipeline') || 'Audit Pipeline'}
      </h4>
      ${auditPipeline.length === 0 ? `
        <div class="text-center py-6 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
          ${t('security.permissions.auditPipeline.empty') || 'No audit pipeline entries.'}
        </div>
      ` : `
        <div class="space-y-2">
          ${auditPipeline.map(entry => {
            const borderColorMap: Record<string, string> = {
              pass: 'border-l-success',
              fail: 'border-l-error',
              warn: 'border-l-warning',
            };
            const bgMap: Record<string, string> = {
              pass: 'bg-success/5',
              fail: 'bg-error/5',
              warn: 'bg-warning/5',
            };
            const textMap: Record<string, string> = {
              pass: 'text-success',
              fail: 'text-error',
              warn: 'text-warning',
            };
            const border = borderColorMap[entry.result] || 'border-l-outline-variant';
            const bg = bgMap[entry.result] || '';
            const textColor = textMap[entry.result] || 'text-on-surface-variant';
            const resultLabel = t(`security.permissions.auditPipeline.result`) || 'Result';
            return `
              <div class="rounded-lg border border-outline-variant/20 border-l-4 ${border} ${bg} bg-surface-container-lowest px-4 py-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-medium text-on-surface">${escHtml(entry.stage)}</span>
                  <span class="px-2 py-0.5 rounded-full text-[11px] ${textColor} ${bg}">${entry.result.toUpperCase()}</span>
                </div>
                <p class="text-xs text-on-surface-variant">${escHtml(entry.detail)}</p>
                <p class="text-[11px] text-on-surface-variant/50 mt-1 font-mono">${escHtml(entry.timestamp)}</p>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Request Permission -->
    <div class="mb-6">
      <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
        ${t('security.requestPermission.title') || 'Request Permission'}
      </h4>
      <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="text-xs text-on-surface-variant mb-1 block">${t('security.requestPermission.scope') || 'Scope'}</label>
            <input id="req-scope" type="text"
                   class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                          border border-outline-variant/30 focus:border-primary outline-none"
                   placeholder="${t('security.requestPermission.scopePlaceholder') || 'e.g. file:write, net:connect'}"
                   value="${escHtml(reqFormScope)}" />
          </div>
          <div>
            <label class="text-xs text-on-surface-variant mb-1 block">${t('security.requestPermission.reason') || 'Reason'}</label>
            <input id="req-reason" type="text"
                   class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                          border border-outline-variant/30 focus:border-primary outline-none"
                   placeholder="${t('security.requestPermission.reasonPlaceholder') || 'Why is this permission needed?'}"
                   value="${escHtml(reqFormReason)}" />
          </div>
          <div>
            <label class="text-xs text-on-surface-variant mb-1 block">${t('security.requestPermission.duration') || 'Duration (minutes)'}</label>
            <input id="req-duration" type="number" min="1" max="1440"
                   class="w-full px-3 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface
                          border border-outline-variant/30 focus:border-primary outline-none"
                   value="${reqFormDuration}" />
          </div>
        </div>
        <button id="btn-submit-request" class="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition">
          ${t('security.requestPermission.submit') || 'Submit Request'}
        </button>
      </div>
    </div>

    <!-- Pending Requests -->
    <div>
      <h4 class="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
        ${t('security.requestPermission.pendingTitle') || 'Pending Requests'}
      </h4>
      ${permissionRequests.length === 0 ? `
        <div class="text-center py-6 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
          ${t('security.requestPermission.noPending') || 'No pending permission requests.'}
        </div>
      ` : `
        <div class="space-y-2">
          ${permissionRequests.map(renderPermissionRequest).join('')}
        </div>
      `}
    </div>
  `;
}

function renderPermissionRequest(req: PermissionRequest): string {
  const statusColors: Record<string, string> = {
    pending: 'bg-warning/15 text-warning',
    approved: 'bg-success/15 text-success',
    denied: 'bg-error/15 text-error',
  };
  const statusLabel = t(`security.requestPermission.status.${req.status}`) || req.status;

  return `
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-xs text-on-surface font-medium">${escHtml(req.scope)}</span>
          <span class="px-2 py-0.5 rounded-full text-[11px] ${statusColors[req.status]}">${statusLabel}</span>
        </div>
        <p class="text-xs text-on-surface-variant">${escHtml(req.reason)}</p>
        <p class="text-[11px] text-on-surface-variant/50 mt-0.5">
          ${t('security.requestPermission.requestedAt') || 'Requested at'}: ${req.requestedAt}
          &middot; ${req.duration} min
        </p>
      </div>
    </div>
  `;
}

function renderPermissionRow(perm: PermissionScope): string {
  const policyColors: Record<string, string> = {
    granted: 'bg-success/15 text-success',
    denied: 'bg-error/15 text-error',
    ask: 'bg-warning/15 text-warning',
  };
  const policyLabel = t(`security.permissions.${perm.policy}`) || perm.policy;
  const isEditing = editingScopeId === perm.id;

  // Risk scoring indicator
  const risk = perm.riskScore ?? 0;
  let riskColor = 'text-success';
  let riskBg = 'bg-success/15';
  let riskLabel = t('security.permissions.riskLow') || 'Low';
  if (risk >= 7) {
    riskColor = 'text-error';
    riskBg = 'bg-error/15';
    riskLabel = t('security.permissions.riskHigh') || 'High';
  } else if (risk >= 4) {
    riskColor = 'text-warning';
    riskBg = 'bg-warning/15';
    riskLabel = t('security.permissions.riskMedium') || 'Medium';
  }

  let windowHtml = '—';
  if (perm.scheduledWindow) {
    const remaining = perm.scheduledWindow.remaining;
    windowHtml = `
      <span class="text-xs">${perm.scheduledWindow.start} - ${perm.scheduledWindow.end}</span>
      ${remaining !== undefined ? `
        <span class="countdown-timer ml-2 px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[11px] font-mono" data-remaining="${remaining}">
          ${formatCountdown(remaining)}
        </span>
      ` : ''}
    `;
  }

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5 font-mono text-xs text-on-surface">${escHtml(perm.scope)}</td>
      <td class="px-4 py-2.5">
        ${isEditing ? `
          <select class="scope-policy-select px-2 py-1 rounded-md bg-surface-container-high text-xs border border-outline-variant/30 text-on-surface" data-id="${perm.id}">
            <option value="granted" ${perm.policy === 'granted' ? 'selected' : ''}>${t('security.permissions.granted') || 'Granted'}</option>
            <option value="denied" ${perm.policy === 'denied' ? 'selected' : ''}>${t('security.permissions.denied') || 'Denied'}</option>
            <option value="ask" ${perm.policy === 'ask' ? 'selected' : ''}>${t('security.permissions.ask') || 'Ask'}</option>
          </select>
        ` : `
          <span class="px-2 py-0.5 rounded-full text-[11px] ${policyColors[perm.policy]}">${policyLabel}</span>
        `}
      </td>
      <td class="px-4 py-2.5">
        <span class="px-2 py-0.5 rounded-full text-[11px] ${riskColor} ${riskBg}">${riskLabel} (${risk})</span>
      </td>
      <td class="px-4 py-2.5">
        <span class="text-xs ${perm.sessionGrant ? 'text-success' : 'text-on-surface-variant/50'}">${perm.sessionGrant ? '&#10003; Yes' : '—'}</span>
      </td>
      <td class="px-4 py-2.5">${windowHtml}</td>
      <td class="px-4 py-2.5">
        <button class="btn-edit-scope px-2 py-1 rounded-md text-[11px] ${isEditing ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'} hover:opacity-80 transition" data-id="${perm.id}">
          ${isEditing ? '&#10003;' : (t('security.permissions.editScope') || 'Edit')}
        </button>
      </td>
    </tr>
  `;
}

function renderAuditSection(): string {
  const filtered = auditLog.filter(entry => {
    if (auditFilterRisk && entry.riskLevel !== auditFilterRisk) return false;
    if (auditFilterSource && !entry.source.toLowerCase().includes(auditFilterSource.toLowerCase())) return false;
    return true;
  });

  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-4">
      ${t('security.audit.title') || 'Audit Log'}
    </h3>

    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4">
      <input id="audit-filter-source" type="text"
             class="px-3 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                    border border-outline-variant/30 focus:border-primary outline-none w-48"
             placeholder="${t('security.audit.filterSource') || 'Filter by source...'}"
             value="${escHtml(auditFilterSource)}" />
      <select id="audit-filter-risk"
              class="px-3 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                     border border-outline-variant/30 focus:border-primary outline-none">
        <option value="">${t('security.audit.filterRisk') || 'Filter by risk'}</option>
        <option value="low" ${auditFilterRisk === 'low' ? 'selected' : ''}>&#x1F7E2; ${t('security.audit.risk.low') || 'Low'}</option>
        <option value="medium" ${auditFilterRisk === 'medium' ? 'selected' : ''}>&#x1F7E1; ${t('security.audit.risk.medium') || 'Medium'}</option>
        <option value="high" ${auditFilterRisk === 'high' ? 'selected' : ''}>&#x1F534; ${t('security.audit.risk.high') || 'High'}</option>
      </select>
      <div class="flex-1"></div>
      <button id="btn-export-audit-json" class="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition">
        ${t('security.audit.exportJson') || 'Export JSON'}
      </button>
      <button id="btn-export-audit-csv" class="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-xs font-medium hover:bg-secondary/20 transition">
        ${t('security.audit.exportCsv') || 'Export CSV'}
      </button>
    </div>

    <!-- Audit Table -->
    ${filtered.length === 0 ? `
      <div class="text-center py-8 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20">
        No audit entries found.
      </div>
    ` : `
      <div class="rounded-xl border border-outline-variant/20 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-surface-container-high/50 text-on-surface-variant text-left">
              <th class="px-4 py-2.5 font-medium">${t('security.audit.source') || 'Source'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.audit.action') || 'Action'}</th>
              <th class="px-4 py-2.5 font-medium w-24">${t('security.audit.riskLevel') || 'Risk'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.audit.timestamp') || 'Timestamp'}</th>
              <th class="px-4 py-2.5 font-medium">${t('security.audit.details') || 'Details'}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/10">
            ${filtered.map(renderAuditRow).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

function renderAuditRow(entry: AuditEntry): string {
  const riskIndicators: Record<string, string> = {
    low: '<span class="text-success">&#x1F7E2;</span>',
    medium: '<span class="text-warning">&#x1F7E1;</span>',
    high: '<span class="text-error">&#x1F534;</span>',
  };
  const riskLabel = t(`security.audit.risk.${entry.riskLevel}`) || entry.riskLevel;

  return `
    <tr class="hover:bg-surface-container/50 transition">
      <td class="px-4 py-2.5 text-on-surface font-mono text-xs">${escHtml(entry.source)}</td>
      <td class="px-4 py-2.5 text-on-surface-variant text-xs">${escHtml(entry.action)}</td>
      <td class="px-4 py-2.5">
        <span class="flex items-center gap-1 text-xs">
          ${riskIndicators[entry.riskLevel] || ''} ${riskLabel}
        </span>
      </td>
      <td class="px-4 py-2.5 text-on-surface-variant text-[11px] font-mono">${entry.timestamp}</td>
      <td class="px-4 py-2.5 text-on-surface-variant text-xs truncate max-w-xs">${escHtml(entry.details)}</td>
    </tr>
  `;
}

function renderIntegritySection(): string {
  return `
    <h3 class="text-lg font-headline font-semibold text-on-surface mb-4">
      ${t('security.integrity.title') || 'System Integrity Check'}
    </h3>
    <button id="btn-run-integrity" class="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition mb-4">
      ${t('security.integrity.runCheck') || 'Run Check'}
    </button>
    ${integrityChecks.length === 0 ? `
      <div class="text-center py-8 text-on-surface-variant/50 text-sm rounded-xl border border-outline-variant/20">
        Run an integrity check to see results.
      </div>
    ` : `
      <div class="space-y-2">
        ${integrityChecks.map(renderIntegrityItem).join('')}
      </div>
    `}
  `;
}

function renderIntegrityItem(check: IntegrityCheck): string {
  const statusConfig: Record<string, { color: string; icon: string; bg: string }> = {
    pass: { color: 'text-success', icon: '&#10003;', bg: 'bg-success/10' },
    warn: { color: 'text-warning', icon: '&#9888;', bg: 'bg-warning/10' },
    fail: { color: 'text-error', icon: '&#10007;', bg: 'bg-error/10' },
  };
  const cfg = statusConfig[check.status] || statusConfig.pass;
  const statusLabel = t(`security.integrity.${check.status}`) || check.status;

  return `
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
      <div class="w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center ${cfg.color} text-sm font-bold">
        ${cfg.icon}
      </div>
      <div class="flex-1">
        <p class="text-sm text-on-surface font-medium">${escHtml(check.label)}</p>
        <p class="text-xs text-on-surface-variant/60">${escHtml(check.detail)}</p>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[11px] ${cfg.color} ${cfg.bg}">${statusLabel}</span>
    </div>
  `;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindEvents(): void {
  if (!container) return;

  // Section navigation
  container.querySelectorAll('.section-btn').forEach(el => {
    el.addEventListener('click', () => {
      activeSection = (el as HTMLElement).dataset.section as typeof activeSection;
      renderFull();
    });
  });

  // Rules section events — toggle add/edit form
  container.querySelector('#btn-add-rule')?.addEventListener('click', () => {
    showAddRuleForm = true;
    editingRuleId = null;
    ruleFormPattern = '';
    ruleFormDescription = '';
    ruleFormMode = 'confirm';
    renderFull();
  });

  container.querySelector('#btn-save-rule')?.addEventListener('click', async () => {
    const patternEl = container?.querySelector('#rule-form-pattern') as HTMLInputElement;
    const descEl = container?.querySelector('#rule-form-description') as HTMLInputElement;
    const modeEl = container?.querySelector('#rule-form-mode') as HTMLSelectElement;
    if (!patternEl?.value.trim()) return;
    // Validate regex
    try { new RegExp(patternEl.value); } catch { alert('Invalid regex pattern'); return; }
    try {
      const customPatterns = rules.filter(r => !r.builtIn).map(r => ({
        pattern: r.id === editingRuleId ? patternEl.value : r.pattern,
        description: r.id === editingRuleId ? descEl.value : r.description,
        mode: r.id === editingRuleId ? modeEl.value : r.mode,
        enabled: r.enabled,
      }));
      if (!editingRuleId) {
        customPatterns.push({ pattern: patternEl.value, description: descEl.value, mode: modeEl.value, enabled: true });
      }
      await GatewayClient.call('security.rules.update', { customPatterns });
    } catch { /* best effort */ }
    showAddRuleForm = false;
    editingRuleId = null;
    await loadData();
  });

  container.querySelector('#btn-cancel-rule')?.addEventListener('click', () => {
    showAddRuleForm = false;
    editingRuleId = null;
    renderFull();
  });

  // Edit existing custom rule
  container.querySelectorAll('.btn-edit-rule').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id || '';
      const rule = rules.find(r => r.id === id);
      if (rule) {
        showAddRuleForm = true;
        editingRuleId = id;
        ruleFormPattern = rule.pattern;
        ruleFormDescription = rule.description;
        ruleFormMode = rule.mode;
        renderFull();
      }
    });
  });

  // Delete custom rule
  container.querySelectorAll('.btn-delete-rule').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id || '';
      if (!confirm(t('security.dangerousCommands.confirmDelete') || 'Delete this rule?')) return;
      try {
        const customPatterns = rules.filter(r => !r.builtIn && r.id !== id).map(r => ({
          pattern: r.pattern, description: r.description, mode: r.mode, enabled: r.enabled,
        }));
        await GatewayClient.call('security.rules.update', { customPatterns });
      } catch { /* best effort */ }
      await loadData();
    });
  });

  container.querySelectorAll('.rule-mode-select').forEach(el => {
    el.addEventListener('change', async () => {
      const select = el as HTMLSelectElement;
      const id = select.dataset.id;
      try {
        await GatewayClient.call('security.updateRule', { ruleId: id, mode: select.value });
      } catch (e) {
        console.error('Update rule mode failed:', e);
      }
    });
  });

  container.querySelectorAll('.rule-toggle').forEach(el => {
    el.addEventListener('change', async () => {
      const checkbox = el as HTMLInputElement;
      const id = checkbox.dataset.id;
      try {
        await GatewayClient.call('security.updateRule', { ruleId: id, enabled: checkbox.checked });
      } catch (e) {
        console.error('Toggle rule failed:', e);
      }
    });
  });

  container.querySelector('#btn-test-rule')?.addEventListener('click', async () => {
    const input = container?.querySelector('#test-rule-input') as HTMLInputElement;
    const resultDiv = container?.querySelector('#test-rule-result');
    if (!input || !resultDiv) return;
    testRuleInput = input.value;
    if (!testRuleInput.trim()) return;

    try {
      const result = await GatewayClient.call<{ matched: boolean; rule?: DangerousRule; mode?: string }>('security.testRule', { command: testRuleInput });
      if (result?.matched) {
        resultDiv.innerHTML = `<span class="text-warning">Matched rule: <code class="font-mono">${escHtml(result.rule?.pattern || '')}</code> — Mode: ${result.mode}</span>`;
      } else {
        resultDiv.innerHTML = `<span class="text-success">No rules matched. Command is allowed.</span>`;
      }
    } catch (e) {
      resultDiv.innerHTML = `<span class="text-error">Test failed: ${e instanceof Error ? e.message : e}</span>`;
    }
  });

  // Audit section events
  container.querySelector('#audit-filter-source')?.addEventListener('input', (e) => {
    auditFilterSource = (e.target as HTMLInputElement).value;
    renderFull();
  });

  container.querySelector('#audit-filter-risk')?.addEventListener('change', (e) => {
    auditFilterRisk = (e.target as HTMLSelectElement).value;
    renderFull();
  });

  container.querySelector('#btn-export-audit-json')?.addEventListener('click', async () => {
    try {
      const result = await GatewayClient.call<{ data: string }>('security.exportAudit', { format: 'json' });
      if (result?.data) {
        downloadFile(result.data, `audit-log-${Date.now()}.json`, 'application/json');
      } else {
        // Fallback: export from local data
        const json = JSON.stringify(auditLog, null, 2);
        downloadFile(json, `audit-log-${Date.now()}.json`, 'application/json');
      }
    } catch {
      // Fallback: export from local data
      const json = JSON.stringify(auditLog, null, 2);
      downloadFile(json, `audit-log-${Date.now()}.json`, 'application/json');
    }
  });

  container.querySelector('#btn-export-audit-csv')?.addEventListener('click', async () => {
    try {
      const result = await GatewayClient.call<{ data: string }>('security.exportAudit', { format: 'csv' });
      if (result?.data) {
        downloadFile(result.data, `audit-log-${Date.now()}.csv`, 'text/csv');
      } else {
        // Fallback: build CSV from local data
        downloadFile(buildAuditCsv(), `audit-log-${Date.now()}.csv`, 'text/csv');
      }
    } catch {
      // Fallback: build CSV from local data
      downloadFile(buildAuditCsv(), `audit-log-${Date.now()}.csv`, 'text/csv');
    }
  });

  // Integrity section events
  container.querySelector('#btn-run-integrity')?.addEventListener('click', async () => {
    try {
      const result = await GatewayClient.call<{ checks: IntegrityCheck[] }>('security.integrityCheck', {});
      if (result?.checks) integrityChecks = result.checks;
      renderFull();
    } catch (e) {
      console.error('Integrity check failed:', e);
    }
  });

  // P6-02: Scope editing
  container.querySelectorAll('.btn-edit-scope').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id || '';
      if (editingScopeId === id) {
        // Save: read the select value
        const select = container?.querySelector(`.scope-policy-select[data-id="${id}"]`) as HTMLSelectElement;
        if (select) {
          const perm = permissions.find(p => p.id === id);
          if (perm) {
            perm.policy = select.value as 'granted' | 'denied' | 'ask';
            try {
              await GatewayClient.call('security.updatePermission', { permissionId: id, policy: perm.policy });
            } catch { /* best effort */ }
          }
        }
        editingScopeId = null;
      } else {
        editingScopeId = id;
      }
      renderFull();
    });
  });

  // P6-01: Submit permission request
  container.querySelector('#btn-submit-request')?.addEventListener('click', async () => {
    const scopeInput = container?.querySelector('#req-scope') as HTMLInputElement;
    const reasonInput = container?.querySelector('#req-reason') as HTMLInputElement;
    const durationInput = container?.querySelector('#req-duration') as HTMLInputElement;
    if (!scopeInput?.value.trim()) return;
    reqFormScope = scopeInput.value;
    reqFormReason = reasonInput?.value || '';
    reqFormDuration = parseInt(durationInput?.value || '30', 10);
    try {
      await GatewayClient.call('security.requestPermission', {
        scope: reqFormScope, reason: reqFormReason, duration: reqFormDuration
      });
      reqFormScope = '';
      reqFormReason = '';
      reqFormDuration = 30;
      await loadData();
    } catch (e) {
      console.error('Permission request failed:', e);
    }
  });

  // Start countdown timers with color coding (P6-07)
  countdownTimers.forEach(t => clearInterval(t));
  countdownTimers = [];
  container.querySelectorAll('.countdown-timer').forEach(el => {
    let remaining = parseInt((el as HTMLElement).dataset.remaining || '0', 10);
    const updateCountdownStyle = (r: number) => {
      const htmlEl = el as HTMLElement;
      htmlEl.textContent = formatCountdown(r);
      // Color code: green >1hr, yellow >10min, red <10min, flashing <1min
      htmlEl.className = 'countdown-timer ml-2 px-1.5 py-0.5 rounded text-[11px] font-mono';
      if (r <= 0) {
        htmlEl.className += ' bg-error/20 text-error';
        htmlEl.textContent = t('security.permissions.expired') || 'Expired';
      } else if (r < 60) {
        htmlEl.className += ' bg-error/20 text-error animate-pulse';
      } else if (r < 600) {
        htmlEl.className += ' bg-error/15 text-error';
      } else if (r < 3600) {
        htmlEl.className += ' bg-warning/10 text-warning';
      } else {
        htmlEl.className += ' bg-success/10 text-success';
      }
    };
    updateCountdownStyle(remaining);
    if (remaining > 0) {
      const timer = setInterval(() => {
        remaining--;
        updateCountdownStyle(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
        }
      }, 1000);
      countdownTimers.push(timer);
    }
  });
}

function buildAuditCsv(): string {
  const headers = ['ID', 'Source', 'Action', 'Risk Level', 'Timestamp', 'Details'];
  const csvEscape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const rows = auditLog.map(entry =>
    [entry.id, entry.source, entry.action, entry.riskLevel, entry.timestamp, entry.details]
      .map(csvEscape)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
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
