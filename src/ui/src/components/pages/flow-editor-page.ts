/**
 * Flow Editor Page — Screen 04
 * Three-panel layout: Node Palette | Canvas (BT Visualizer) | Properties Panel
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

// ── Types ──
interface BTNode {
  id: string;
  type: string;
  name: string;
  status?: 'success' | 'failure' | 'running' | 'idle';
  children?: BTNode[];
  tool?: string;
  args?: string;
  config?: Record<string, unknown>;
}

interface FlowDef {
  id: string;
  name: string;
  hint?: string;
  successRate?: number;
  root?: BTNode;
}

interface NodeTypeInfo {
  type: string;
  category: 'control' | 'action' | 'logic';
  icon: string;
  nameKey: string;
  descKey: string;
}

// ── Node type definitions ──
const NODE_TYPES: NodeTypeInfo[] = [
  { type: 'sequence',  category: 'control', icon: '⇢', nameKey: 'flows.editor.node.sequence',  descKey: 'flows.editor.node.sequence.desc' },
  { type: 'selector',  category: 'control', icon: '?', nameKey: 'flows.editor.node.selector',  descKey: 'flows.editor.node.selector.desc' },
  { type: 'fallback',  category: 'control', icon: '↩', nameKey: 'flows.editor.node.fallback',  descKey: 'flows.editor.node.fallback.desc' },
  { type: 'action',    category: 'action',  icon: '▶', nameKey: 'flows.editor.node.action',    descKey: 'flows.editor.node.action.desc' },
  { type: 'llm',       category: 'action',  icon: '✦', nameKey: 'flows.editor.node.llm',       descKey: 'flows.editor.node.llm.desc' },
  { type: 'condition',  category: 'logic',  icon: '◇', nameKey: 'flows.editor.node.condition', descKey: 'flows.editor.node.condition.desc' },
  { type: 'fsm',       category: 'logic',   icon: '◎', nameKey: 'flows.editor.node.fsm',       descKey: 'flows.editor.node.fsm.desc' },
];

// ── State ──
let container: HTMLElement | null = null;
let currentFlow: FlowDef | null = null;
let selectedNodeId: string | null = null;
let flows: FlowDef[] = [];
let showAiModal = false;
let aiGenerating = false;

// ── Render ──
export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('flows');
  loadFlows();
  renderFull();
  bindEvents();
}

export function cleanup(): void {
  container = null;
  currentFlow = null;
  selectedNodeId = null;
  flows = [];
}

async function loadFlows(): Promise<void> {
  try {
    const result = await GatewayClient.call<{ flows?: FlowDef[] }>('flows.list');
    flows = result?.flows ?? [];
    if (flows.length > 0 && !currentFlow) {
      currentFlow = flows[0];
    }
    renderFull();
    bindEvents();
  } catch {
    // Use demo data on error
    currentFlow = createDemoFlow();
    renderFull();
    bindEvents();
  }
}

function createDemoFlow(): FlowDef {
  return {
    id: 'demo-flow-1',
    name: 'Demo Flow',
    hint: 'Example behavior tree',
    successRate: 87.5,
    root: {
      id: 'n1', type: 'sequence', name: 'Root Sequence', status: 'success',
      children: [
        {
          id: 'n2', type: 'condition', name: 'Check Input', status: 'success',
          children: [],
        },
        {
          id: 'n3', type: 'selector', name: 'Process', status: 'success',
          children: [
            { id: 'n4', type: 'llm', name: 'LLM Analyze', status: 'success', tool: 'gpt-4', args: '{"prompt":"..."}' },
            { id: 'n5', type: 'action', name: 'Fallback Action', status: 'idle', tool: 'shell', args: '{"cmd":"echo ok"}' },
          ],
        },
        {
          id: 'n6', type: 'action', name: 'Save Result', status: 'idle', tool: 'db.write', args: '{}',
        },
      ],
    },
  };
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex h-full overflow-hidden">
      <!-- Left Panel: Node Palette -->
      <div class="w-56 shrink-0 border-r border-outline-variant/20 bg-surface-container-lowest flex flex-col">
        <div class="px-3 py-3 border-b border-outline-variant/20">
          <h3 class="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
            <svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Z"/>
            </svg>
            ${t('flows.editor.nodeTypes')}
          </h3>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-3">
          ${renderNodePalette()}
        </div>
      </div>

      <!-- Center: Canvas -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Toolbar -->
        <div class="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/20 bg-surface-container-low">
          <button id="btn-new-flow"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-primary text-on-primary hover:bg-primary-dim transition">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14m-7-7h14"/>
            </svg>
            ${t('flows.editor.newFlow')}
          </button>
          <button id="btn-save-flow"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition
                         border border-outline-variant/30">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"/>
            </svg>
            ${t('flows.editor.save')}
          </button>
          <button id="btn-run-flow"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-success/15 text-success hover:bg-success/25 transition
                         border border-success/30">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>
            </svg>
            ${t('flows.editor.run')}
          </button>
          <button id="btn-ai-generate"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-tertiary/15 text-tertiary hover:bg-tertiary/25 transition
                         border border-tertiary/30">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
            </svg>
            ${t('flows.editor.aiGenerate')}
          </button>
          <div class="flex-1"></div>
          <span class="text-xs text-on-surface-variant/50 font-mono">
            ${currentFlow ? currentFlow.name : '—'}
          </span>
        </div>

        <!-- Canvas Area -->
        <div id="flow-canvas" class="flex-1 overflow-auto relative"
             style="background-image: radial-gradient(circle, rgba(var(--md-on-surface-rgb, 200,200,200), 0.15) 1px, transparent 1px);
                    background-size: 20px 20px;">
          ${currentFlow?.root ? renderCanvasTree() : renderCanvasEmpty()}
        </div>
      </div>

      <!-- Right Panel: Properties -->
      <div class="w-64 shrink-0 border-l border-outline-variant/20 bg-surface-container-lowest flex flex-col">
        <div class="px-3 py-3 border-b border-outline-variant/20">
          <h3 class="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
            <svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"/>
            </svg>
            ${t('flows.editor.properties')}
          </h3>
        </div>
        <div class="flex-1 overflow-y-auto">
          ${renderPropertiesPanel()}
        </div>
      </div>
    </div>
    ${renderAiGenerateModal()}
  `;
}

// ── Node Palette ──
function renderNodePalette(): string {
  const categories: Array<{ key: 'control' | 'action' | 'logic'; labelKey: string }> = [
    { key: 'control', labelKey: 'flows.editor.category.control' },
    { key: 'action',  labelKey: 'flows.editor.category.action' },
    { key: 'logic',   labelKey: 'flows.editor.category.logic' },
  ];

  return categories.map(cat => {
    const nodes = NODE_TYPES.filter(n => n.category === cat.key);
    const catColors: Record<string, string> = {
      control: 'text-blue-400',
      action: 'text-emerald-400',
      logic: 'text-amber-400',
    };
    return `
      <div>
        <div class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/50 px-1 mb-1">
          ${t(cat.labelKey)}
        </div>
        <div class="space-y-1">
          ${nodes.map(n => `
            <div class="palette-node flex items-center gap-2 px-2 py-1.5 rounded-lg
                        bg-surface-container hover:bg-surface-container-high cursor-grab
                        border border-outline-variant/20 hover:border-primary/40 transition group"
                 draggable="true" data-node-type="${n.type}">
              <span class="w-6 h-6 rounded-md bg-surface-container-highest flex items-center justify-center
                           text-xs ${catColors[cat.key]} group-hover:scale-110 transition-transform">
                ${n.icon}
              </span>
              <div class="min-w-0">
                <div class="text-xs font-medium text-on-surface truncate">${t(n.nameKey)}</div>
                <div class="text-[10px] text-on-surface-variant/50 truncate">${t(n.descKey)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ── Canvas Tree Rendering ──
function renderCanvasTree(): string {
  if (!currentFlow?.root) return renderCanvasEmpty();

  const svgLines: string[] = [];
  const nodeBoxes: string[] = [];
  layoutTree(currentFlow.root, 0, 0, nodeBoxes, svgLines);

  // Compute bounding box
  const treeWidth = getTreeWidth(currentFlow.root) * 180;
  const treeHeight = getTreeDepth(currentFlow.root) * 100;
  const canvasW = Math.max(treeWidth + 100, 800);
  const canvasH = Math.max(treeHeight + 100, 500);

  return `
    <div class="absolute inset-0 flex items-start justify-center pt-8 overflow-auto">
      <svg width="${canvasW}" height="${canvasH}" class="shrink-0">
        <!-- Connection lines -->
        ${svgLines.join('\n')}
        <!-- Node boxes rendered as foreignObject -->
        ${nodeBoxes.join('\n')}
      </svg>
    </div>
  `;
}

function layoutTree(node: BTNode, depth: number, index: number, boxes: string[], lines: string[],
                    parentX?: number, parentY?: number): { x: number; y: number } {
  const xSpacing = 180;
  const ySpacing = 100;

  let x: number;
  const y = depth * ySpacing + 40;

  if (!node.children || node.children.length === 0) {
    x = index * xSpacing + 90;
  } else {
    // Layout children first
    const childPositions: Array<{ x: number; y: number }> = [];
    let childIdx = index;
    for (const child of node.children) {
      const pos = layoutTree(child, depth + 1, childIdx, boxes, lines);
      childPositions.push(pos);
      childIdx += getTreeWidth(child);
    }
    // Center parent above children
    const firstChildX = childPositions[0].x;
    const lastChildX = childPositions[childPositions.length - 1].x;
    x = (firstChildX + lastChildX) / 2;

    // Draw lines to children
    for (const cp of childPositions) {
      lines.push(`<line x1="${x}" y1="${y + 32}" x2="${cp.x}" y2="${cp.y}"
                        stroke="rgba(var(--md-on-surface-rgb, 200,200,200), 0.3)" stroke-width="1.5"
                        stroke-dasharray="${node.type === 'selector' ? '4,3' : 'none'}"/>`);
    }
  }

  // Draw parent line
  if (parentX !== undefined && parentY !== undefined) {
    // Already drawn from parent side
  }

  // Node box
  const statusBorder = getStatusBorderColor(node.status);
  const typeColor = getTypeColor(node.type);
  const isSelected = selectedNodeId === node.id;

  boxes.push(`
    <foreignObject x="${x - 70}" y="${y}" width="140" height="32">
      <div xmlns="http://www.w3.org/1999/xhtml"
           class="bt-node flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer
                  border-2 ${statusBorder} ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : ''}
                  bg-surface-container-high hover:bg-surface-container-highest transition text-center"
           data-node-id="${node.id}">
        <span class="text-[10px] ${typeColor} font-bold shrink-0">${getTypeIcon(node.type)}</span>
        <span class="text-[11px] text-on-surface font-medium truncate flex-1">${escapeHtml(node.name)}</span>
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

function getStatusBorderColor(status?: string): string {
  switch (status) {
    case 'success': return 'border-success';
    case 'running': return 'border-blue-500 animate-pulse';
    case 'failure': return 'border-error';
    default:        return 'border-outline-variant/40';
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'sequence': case 'selector': case 'fallback':
      return 'text-blue-400';
    case 'action': case 'llm':
      return 'text-emerald-400';
    case 'condition': case 'fsm':
      return 'text-amber-400';
    default:
      return 'text-on-surface-variant';
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

function renderCanvasEmpty(): string {
  return `
    <div class="flex flex-col items-center justify-center h-full gap-3">
      <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center">
        <svg class="w-8 h-8 text-primary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"/>
        </svg>
      </div>
      <p class="text-sm text-on-surface-variant/50">${t('flows.editor.canvas.empty')}</p>
    </div>
  `;
}

// ── Properties Panel ──
function renderPropertiesPanel(): string {
  const node = selectedNodeId && currentFlow?.root ? findNode(currentFlow.root, selectedNodeId) : null;

  if (!node) {
    return `
      <div class="p-3 space-y-4">
        <!-- Flow Metadata -->
        ${currentFlow ? renderFlowMetadata() : ''}
        <div class="flex flex-col items-center justify-center py-8 gap-2">
          <svg class="w-8 h-8 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59"/>
          </svg>
          <p class="text-xs text-on-surface-variant/50 text-center">${t('flows.editor.noNodeSelected')}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="p-3 space-y-4">
      <!-- Node Properties -->
      <div class="space-y-2">
        <label class="block text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
          ${t('flows.editor.nodeName')}
        </label>
        <input id="prop-name" type="text" value="${escapeHtml(node.name)}"
               class="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                      border border-outline-variant/30 focus:border-primary outline-none transition"/>
      </div>

      <div class="space-y-2">
        <label class="block text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
          Type
        </label>
        <div class="px-2.5 py-1.5 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono
                    border border-outline-variant/20">
          ${node.type}
        </div>
      </div>

      ${node.tool !== undefined ? `
      <div class="space-y-2">
        <label class="block text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
          ${t('flows.editor.nodeTool')}
        </label>
        <input id="prop-tool" type="text" value="${escapeHtml(node.tool ?? '')}"
               class="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                      border border-outline-variant/30 focus:border-primary outline-none transition font-mono"/>
      </div>
      ` : ''}

      ${node.args !== undefined ? `
      <div class="space-y-2">
        <label class="block text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
          ${t('flows.editor.nodeArgs')}
        </label>
        <input id="prop-args" type="text" value="${escapeHtml(node.args ?? '')}"
               class="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface
                      border border-outline-variant/30 focus:border-primary outline-none transition font-mono"/>
      </div>
      ` : ''}

      <!-- Advanced Config JSON -->
      <div class="space-y-2">
        <label class="block text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
          ${t('flows.editor.advancedConfig')}
        </label>
        <textarea id="prop-json" rows="5"
                  class="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-high text-xs text-on-surface font-mono
                         border border-outline-variant/30 focus:border-primary outline-none transition resize-y"
        >${JSON.stringify(node.config ?? {}, null, 2)}</textarea>
      </div>

      <!-- Flow Metadata -->
      ${currentFlow ? renderFlowMetadata() : ''}
    </div>
  `;
}

function renderFlowMetadata(): string {
  if (!currentFlow) return '';
  return `
    <div class="pt-3 border-t border-outline-variant/20 space-y-2">
      <div class="text-[10px] font-label font-semibold uppercase tracking-wider text-on-surface-variant/60">
        ${t('flows.editor.flowMetadata')}
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-on-surface-variant/60">${t('flows.editor.flowId')}</span>
          <span class="text-on-surface font-mono text-[10px]">${currentFlow.id}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-on-surface-variant/60">${t('flows.editor.flowHint')}</span>
          <span class="text-on-surface truncate ml-2 max-w-[120px]">${escapeHtml(currentFlow.hint ?? '—')}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-on-surface-variant/60">${t('flows.editor.successRate')}</span>
          <span class="text-success font-mono text-[10px]">${currentFlow.successRate != null ? currentFlow.successRate.toFixed(1) + '%' : '—'}</span>
        </div>
      </div>
    </div>
  `;
}

function findNode(node: BTNode, id: string): BTNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

// ── Events ──
function bindEvents(): void {
  if (!container) return;

  // Node selection on canvas
  container.querySelectorAll('.bt-node').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.nodeId;
      if (id) {
        selectedNodeId = id;
        renderFull();
        bindEvents();
      }
    });
  });

  // Toolbar buttons
  container.querySelector('#btn-new-flow')?.addEventListener('click', async () => {
    try {
      const result = await GatewayClient.call<FlowDef>('flows.create', { name: 'New Flow' });
      if (result) {
        currentFlow = result;
        selectedNodeId = null;
        renderFull();
        bindEvents();
      }
    } catch {
      // Create locally
      currentFlow = {
        id: 'flow-' + Date.now(),
        name: 'New Flow',
        root: { id: 'root-' + Date.now(), type: 'sequence', name: 'Root', children: [] },
      };
      selectedNodeId = null;
      renderFull();
      bindEvents();
    }
  });

  container.querySelector('#btn-save-flow')?.addEventListener('click', async () => {
    if (!currentFlow) return;
    try {
      await GatewayClient.call('flows.save', { flow: currentFlow });
    } catch {
      // Silently fail in demo
    }
  });

  container.querySelector('#btn-run-flow')?.addEventListener('click', async () => {
    if (!currentFlow) return;
    try {
      await GatewayClient.call('flows.run', { flowId: currentFlow.id });
    } catch {
      // Navigate to monitor would happen via router
    }
  });

  container.querySelector('#btn-ai-generate')?.addEventListener('click', () => {
    showAiModal = true;
    renderFull();
    bindEvents();
  });

  // AI Generate Modal events
  container.querySelector('#btn-ai-cancel')?.addEventListener('click', () => {
    showAiModal = false;
    aiGenerating = false;
    renderFull();
    bindEvents();
  });

  container.querySelector('#btn-ai-submit')?.addEventListener('click', async () => {
    const textarea = container?.querySelector('#ai-prompt-input') as HTMLTextAreaElement;
    if (!textarea?.value.trim()) return;
    aiGenerating = true;
    renderFull();
    bindEvents();
    try {
      const result = await GatewayClient.call<{ flow?: FlowDef }>('flows.aiGenerate', { prompt: textarea.value });
      if (result?.flow) {
        currentFlow = result.flow;
        selectedNodeId = null;
      }
    } catch {
      // Fallback: create a stub flow from prompt
      currentFlow = {
        id: 'ai-' + Date.now(),
        name: 'AI Generated Flow',
        hint: textarea.value.slice(0, 80),
        root: { id: 'root-' + Date.now(), type: 'sequence', name: 'Root', status: 'idle', children: [
          { id: 'n-' + Date.now(), type: 'llm', name: 'AI Step', status: 'idle' }
        ] },
      };
    }
    showAiModal = false;
    aiGenerating = false;
    renderFull();
    bindEvents();
  });

  // Palette drag start
  container.querySelectorAll('.palette-node').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const ev = e as DragEvent;
      const nodeType = (el as HTMLElement).dataset.nodeType;
      ev.dataTransfer?.setData('text/plain', nodeType ?? '');
    });
  });

  // Canvas drop
  const canvas = container.querySelector('#flow-canvas');
  canvas?.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  canvas?.addEventListener('drop', (e) => {
    e.preventDefault();
    const ev = e as DragEvent;
    const nodeType = ev.dataTransfer?.getData('text/plain');
    if (nodeType && currentFlow?.root) {
      const newNode: BTNode = {
        id: 'n-' + Date.now(),
        type: nodeType,
        name: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
        status: 'idle',
        children: ['sequence', 'selector', 'fallback'].includes(nodeType) ? [] : undefined,
      };
      // Add to root children
      if (!currentFlow.root.children) currentFlow.root.children = [];
      currentFlow.root.children.push(newNode);
      renderFull();
      bindEvents();
    }
  });

  // Property edits
  container.querySelector('#prop-name')?.addEventListener('change', (e) => {
    const node = selectedNodeId && currentFlow?.root ? findNode(currentFlow.root, selectedNodeId) : null;
    if (node) {
      node.name = (e.target as HTMLInputElement).value;
      renderFull();
      bindEvents();
    }
  });

  container.querySelector('#prop-tool')?.addEventListener('change', (e) => {
    const node = selectedNodeId && currentFlow?.root ? findNode(currentFlow.root, selectedNodeId) : null;
    if (node) {
      node.tool = (e.target as HTMLInputElement).value;
    }
  });

  container.querySelector('#prop-args')?.addEventListener('change', (e) => {
    const node = selectedNodeId && currentFlow?.root ? findNode(currentFlow.root, selectedNodeId) : null;
    if (node) {
      node.args = (e.target as HTMLInputElement).value;
    }
  });
}

// ── AI Generate Modal ──
function renderAiGenerateModal(): string {
  if (!showAiModal) return '';
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60" id="ai-modal-overlay">
      <div class="w-[480px] rounded-2xl bg-surface-container-high border border-outline-variant/30 shadow-xl p-6">
        <h3 class="text-lg font-headline font-semibold text-on-surface mb-3">
          ${t('flows.editor.aiGenerate.modalTitle')}
        </h3>
        <p class="text-sm text-on-surface-variant/70 mb-4">${t('flows.editor.aiGenerate.description')}</p>
        <textarea id="ai-prompt-input" rows="5"
                  class="w-full px-3 py-2 rounded-lg bg-surface-container text-sm text-on-surface
                         border border-outline-variant/30 focus:border-primary outline-none resize-y font-mono"
                  placeholder="${t('flows.editor.aiGenerate.placeholder')}"
                  ${aiGenerating ? 'disabled' : ''}></textarea>
        <div class="flex justify-end gap-2 mt-4">
          <button id="btn-ai-cancel"
                  class="px-4 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm font-medium hover:bg-surface-container-highest transition"
                  ${aiGenerating ? 'disabled' : ''}>
            ${t('flows.editor.aiGenerate.cancel')}
          </button>
          <button id="btn-ai-submit"
                  class="px-4 py-2 rounded-lg bg-tertiary text-on-primary text-sm font-medium hover:bg-tertiary/90 transition
                         ${aiGenerating ? 'opacity-60 pointer-events-none' : ''}"
                  ${aiGenerating ? 'disabled' : ''}>
            ${aiGenerating
              ? `<span class="inline-block w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin mr-2"></span>${t('flows.editor.aiGenerate.generating')}`
              : t('flows.editor.aiGenerate.generate')}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Utilities ──
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
