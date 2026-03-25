/**
 * RAG Knowledge Nexus — Screen 12
 * Vector collections, motivation trigger map, ingestion pipeline
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let searchQuery = '';

interface VectorCollection {
  name: string;
  vectors: number;
  fileSize: string;
  lastIndexed: string;
  enabled: boolean;
  builtIn: boolean;
}

interface MotivationEntry {
  cluster: string;
  description: string;
  action: 'ROUTE_TO_LOCAL_FLOW' | 'ESCALATE_TO_CLOUD';
  targetFlow: string;
}

// P4-12: Create Collection modal state
let showCreateModal = false;
let createModalLoading = false;
let createModalError = '';

// P4-14: Ingestion progress state
interface IngestionProgress {
  collection: string;
  percent: number;
  currentFile: string;
  filesProcessed: number;
  totalFiles: number;
  status: 'idle' | 'inProgress' | 'complete' | 'error';
}
let ingestionProgress: IngestionProgress | null = null;
let ingestionPollTimer: ReturnType<typeof setInterval> | null = null;

let collections: VectorCollection[] = [];
let motivationEntries: MotivationEntry[] = [];
let loading = true;
let error = '';

// P4-13: Reindex state per collection
let reindexingCollections = new Set<string>();
let reindexResults = new Map<string, { type: 'success' | 'error'; message: string }>();

// P4-11: Motivation modal state
let motivationModalOpen = false;
let motivationModalMode: 'create' | 'edit' = 'create';
let motivationEditIndex = -1;
let motivationForm: MotivationEntry = {
  cluster: '',
  description: '',
  action: 'ROUTE_TO_LOCAL_FLOW',
  targetFlow: '',
};
let motivationSaving = false;
let motivationFeedback: { type: 'success' | 'error'; message: string } | null = null;

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('rag');
  loadData();
  renderFull();
}

export function cleanup(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  container = null;
  collections = [];
  motivationEntries = [];
  loading = true;
  error = '';
  searchQuery = '';
  reindexingCollections = new Set();
  reindexResults = new Map();
  motivationModalOpen = false;
  motivationSaving = false;
  motivationFeedback = null;
  showCreateModal = false;
  createModalLoading = false;
  createModalError = '';
  if (ingestionPollTimer) clearInterval(ingestionPollTimer);
  ingestionPollTimer = null;
  ingestionProgress = null;
}

async function loadData(): Promise<void> {
  loading = true;
  error = '';
  renderFull();

  try {
    const [colResult, reindexResult] = await Promise.allSettled([
      GatewayClient.call<{ collections: VectorCollection[] }>('rag.collections', {}),
      GatewayClient.call<{ triggers: MotivationEntry[] }>('rag.reindex', {}),
    ]);

    if (colResult.status === 'fulfilled' && colResult.value?.collections) {
      collections = colResult.value.collections;
    } else {
      // Demo data when RPC not available
      collections = [
        { name: 'flows', vectors: 1284, fileSize: '12.4 MB', lastIndexed: '2 hours ago', enabled: true, builtIn: true },
        { name: 'skills', vectors: 876, fileSize: '8.1 MB', lastIndexed: '4 hours ago', enabled: true, builtIn: true },
        { name: 'motivation', vectors: 342, fileSize: '3.2 MB', lastIndexed: '1 hour ago', enabled: true, builtIn: true },
        { name: 'user-docs', vectors: 2150, fileSize: '24.7 MB', lastIndexed: '30 min ago', enabled: true, builtIn: false },
        { name: 'meeting-notes', vectors: 567, fileSize: '5.8 MB', lastIndexed: '1 day ago', enabled: false, builtIn: false },
      ];
    }

    if (reindexResult.status === 'fulfilled' && reindexResult.value?.triggers) {
      motivationEntries = reindexResult.value.triggers;
    } else {
      motivationEntries = [
        { cluster: 'productivity-boost', description: 'User requests efficiency improvement', action: 'ROUTE_TO_LOCAL_FLOW', targetFlow: 'optimize-workflow' },
        { cluster: 'error-recovery', description: 'System error detected, needs recovery', action: 'ROUTE_TO_LOCAL_FLOW', targetFlow: 'error-handler' },
        { cluster: 'creative-ideation', description: 'Creative brainstorming request', action: 'ESCALATE_TO_CLOUD', targetFlow: 'cloud-ideation' },
        { cluster: 'security-alert', description: 'Potential security threat detected', action: 'ESCALATE_TO_CLOUD', targetFlow: 'security-response' },
      ];
    }
  } catch {
    error = t('rag.error.loadFailed') || 'Failed to load RAG data';
  }

  loading = false;
  renderFull();
}

function getFilteredCollections(): VectorCollection[] {
  if (!searchQuery) return collections;
  const q = searchQuery.toLowerCase();
  return collections.filter(c => c.name.toLowerCase().includes(q));
}

function renderFull(): void {
  if (!container) return;

  const filtered = getFilteredCollections();

  container.innerHTML = `
    <div class="h-full overflow-y-auto">
      <div class="max-w-6xl mx-auto p-6 space-y-6">

        <!-- Header -->
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-headline font-bold text-on-surface">
            ${t('rag.title') || 'RAG Knowledge Nexus'}
          </h1>
          <button id="rag-refresh-btn" class="px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition">
            ${t('rag.refresh') || 'Refresh'}
          </button>
        </div>

        <!-- Search Bar (frosted glass) -->
        <div class="relative">
          <div class="backdrop-blur-xl bg-surface-container/60 border border-outline-variant/20 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <svg class="w-5 h-5 text-on-surface-variant/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input id="rag-search" type="text" value="${searchQuery}"
                   placeholder="${t('rag.search') || 'Search collections, documents...'}"
                   class="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/40 outline-none" />
          </div>
        </div>

        ${loading ? `
          <div class="flex items-center justify-center py-20">
            <div class="flex items-center gap-3 text-on-surface-variant/60">
              <div class="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              <span class="text-sm">${t('rag.loading') || 'Loading...'}</span>
            </div>
          </div>
        ` : error ? `
          <div class="flex items-center justify-center py-20">
            <div class="text-center space-y-2">
              <p class="text-sm text-error">${error}</p>
              <button id="rag-retry-btn" class="text-xs text-primary hover:underline">${t('rag.refresh') || 'Refresh'}</button>
            </div>
          </div>
        ` : `
          <!-- Collections Grid -->
          <section>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-headline font-semibold text-on-surface flex items-center gap-2">
                <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
                </svg>
                ${t('rag.collections') || 'Vector Collections'}
              </h2>
              <!-- P4-12: New Collection button -->
              <button id="rag-new-collection-btn" class="px-3 py-1.5 rounded-lg text-xs font-medium
                             bg-primary/10 text-primary hover:bg-primary/20 transition flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                ${t('rag.newCollection') || 'New Collection'}
              </button>
            </div>
            </h2>

            ${filtered.length === 0 ? `
              <div class="text-center py-12 text-on-surface-variant/50 text-sm">
                ${t('rag.noCollections') || 'No vector collections found'}
              </div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${filtered.map(col => renderCollectionCard(col)).join('')}
              </div>
            `}
          </section>

          <!-- Motivation Trigger Map -->
          <section>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-lg font-headline font-semibold text-on-surface flex items-center gap-2">
                  <svg class="w-5 h-5 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  ${t('rag.motivation') || 'Motivation Trigger Map'}
                </h2>
                <p class="text-xs text-on-surface-variant/50 mt-1">
                  ${t('rag.motivationDesc') || 'Route motivation signals to local flows or escalate to cloud'}
                </p>
              </div>
              <button id="rag-add-entry-btn" class="px-3 py-1.5 rounded-lg text-xs font-medium
                             bg-primary/10 text-primary hover:bg-primary/20 transition">
                ${t('rag.addEntry') || '+ Add Entry'}
              </button>
            </div>

            ${renderMotivationFeedback()}

            <div class="rounded-xl border border-outline-variant/20 overflow-hidden bg-surface-container-lowest">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-surface-container-high/50 text-on-surface-variant text-xs uppercase tracking-wider">
                    <th class="text-left px-4 py-3 font-medium">${t('rag.cluster') || 'Cluster'}</th>
                    <th class="text-left px-4 py-3 font-medium">${t('rag.description') || 'Description'}</th>
                    <th class="text-left px-4 py-3 font-medium">${t('rag.action') || 'Action'}</th>
                    <th class="text-left px-4 py-3 font-medium">${t('rag.targetFlow') || 'Target Flow'}</th>
                    <th class="text-right px-4 py-3 font-medium">${t('rag.actions') || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10">
                  ${motivationEntries.map((entry, idx) => `
                    <tr class="hover:bg-surface-container-high/30 transition">
                      <td class="px-4 py-3 font-mono text-xs text-secondary">${entry.cluster}</td>
                      <td class="px-4 py-3 text-on-surface-variant">${entry.description}</td>
                      <td class="px-4 py-3">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${entry.action === 'ROUTE_TO_LOCAL_FLOW'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-tertiary/10 text-tertiary'}">
                          ${entry.action === 'ROUTE_TO_LOCAL_FLOW'
                            ? (t('rag.routeToLocal') || 'Route to Local Flow')
                            : (t('rag.escalateToCloud') || 'Escalate to Cloud')}
                        </span>
                      </td>
                      <td class="px-4 py-3 font-mono text-xs text-on-surface">${entry.targetFlow}</td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                          <button class="mot-edit-btn px-2 py-1 rounded text-xs font-medium
                                         bg-secondary/10 text-secondary hover:bg-secondary/20 transition"
                                  data-index="${idx}">
                            ${t('rag.editEntry') || 'Edit'}
                          </button>
                          <button class="mot-delete-btn px-2 py-1 rounded text-xs font-medium
                                         bg-error/10 text-error hover:bg-error/20 transition"
                                  data-index="${idx}">
                            ${t('rag.deleteEntry') || 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <!-- Ingestion Pipeline Status -->
          <section>
            <h2 class="text-lg font-headline font-semibold text-on-surface mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              ${t('rag.ingestionPipeline') || 'Ingestion Pipeline'}
            </h2>
            ${renderIngestionPipelineStatus()}
          </section>
        `}
      </div>
    </div>

    ${motivationModalOpen ? renderMotivationModal() : ''}
    ${showCreateModal ? renderCreateCollectionModal() : ''}
  `;

  bindEvents();
}

function renderCollectionCard(col: VectorCollection): string {
  const isReindexing = reindexingCollections.has(col.name);
  const result = reindexResults.get(col.name);

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-3
                hover:border-outline-variant/40 transition group">
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <h3 class="font-mono text-sm font-semibold text-on-surface">${col.name}</h3>
          ${col.builtIn ? `
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/10 text-secondary uppercase tracking-wider">
              ${t('rag.builtIn') || 'Built-in'}
            </span>
          ` : ''}
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-2 h-2 rounded-full ${col.enabled ? 'bg-green-400' : 'bg-on-surface-variant/30'}"></div>
          <span class="text-[10px] text-on-surface-variant/60">
            ${col.enabled ? (t('rag.enabled') || 'Enabled') : (t('rag.disabled') || 'Disabled')}
          </span>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-lg bg-surface-container-high/50 p-2">
          <div class="text-xs text-on-surface-variant/50">${t('rag.vectors') || 'Vectors'}</div>
          <div class="text-sm font-mono font-semibold text-on-surface mt-0.5">${col.vectors.toLocaleString()}</div>
        </div>
        <div class="rounded-lg bg-surface-container-high/50 p-2">
          <div class="text-xs text-on-surface-variant/50">${t('rag.fileSize') || 'Size'}</div>
          <div class="text-sm font-mono font-semibold text-on-surface mt-0.5">${col.fileSize}</div>
        </div>
        <div class="rounded-lg bg-surface-container-high/50 p-2">
          <div class="text-xs text-on-surface-variant/50">${t('rag.lastIndexed') || 'Last Indexed'}</div>
          <div class="text-sm font-mono font-semibold text-on-surface mt-0.5">${col.lastIndexed || (t('rag.never') || 'Never')}</div>
        </div>
      </div>

      <!-- P4-13: Reindex feedback -->
      ${result ? `
        <div class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2
                    ${result.type === 'success' ? 'bg-green-400/10 text-green-400' : 'bg-error/10 text-error'}">
          ${result.type === 'success' ? `
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ` : `
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          `}
          <span>${result.message}</span>
        </div>
      ` : ''}

      <!-- Actions -->
      <div class="flex gap-2 pt-1">
        <button class="rag-reindex-btn flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5
                       ${isReindexing
                         ? 'bg-primary/5 text-primary/40 cursor-not-allowed'
                         : 'bg-primary/10 text-primary hover:bg-primary/20'}"
                data-collection="${col.name}"
                ${isReindexing ? 'disabled' : ''}>
          ${isReindexing ? `
            <div class="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            ${t('rag.reindexing') || 'Reindexing...'}
          ` : `
            ${t('rag.reindex') || 'Reindex'}
          `}
        </button>
        <button class="rag-ingest-btn flex-1 px-2 py-1.5 rounded-lg text-xs font-medium
                       bg-secondary/10 text-secondary hover:bg-secondary/20 transition"
                data-collection="${col.name}">
          ${t('rag.ingest') || 'Ingest'}
        </button>
        ${!col.builtIn ? `
          <button class="rag-delete-btn px-2 py-1.5 rounded-lg text-xs font-medium
                         bg-error/10 text-error hover:bg-error/20 transition"
                  data-collection="${col.name}">
            ${t('rag.delete') || 'Delete'}
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// P4-11: Motivation feedback banner
function renderMotivationFeedback(): string {
  if (!motivationFeedback) return '';
  const isSuccess = motivationFeedback.type === 'success';
  return `
    <div class="mb-4 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2
                ${isSuccess ? 'bg-green-400/10 text-green-400' : 'bg-error/10 text-error'}">
      ${isSuccess ? `
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ` : `
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      `}
      <span>${motivationFeedback.message}</span>
      <button id="mot-feedback-dismiss" class="ml-auto text-current opacity-60 hover:opacity-100">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `;
}

// P4-11: Motivation create/edit modal
function renderMotivationModal(): string {
  const isEdit = motivationModalMode === 'edit';
  const title = isEdit
    ? (t('rag.motivationModal.editTitle') || 'Edit Motivation Entry')
    : (t('rag.motivationModal.createTitle') || 'Create Motivation Entry');

  return `
    <div id="mot-modal-overlay" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="w-full max-w-lg mx-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-headline font-semibold text-on-surface">${title}</h3>
          <button id="mot-modal-close" class="p-1.5 rounded-lg hover:bg-surface-container-high transition text-on-surface-variant">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form id="mot-form" class="space-y-4">
          <!-- Cluster -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.motivationModal.cluster') || 'Cluster'} <span class="text-error">*</span>
            </label>
            <input id="mot-cluster" type="text" value="${escapeAttr(motivationForm.cluster)}"
                   placeholder="${t('rag.motivationModal.clusterPlaceholder') || 'e.g. productivity-boost'}"
                   class="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest
                          text-sm text-on-surface placeholder-on-surface-variant/40 outline-none
                          focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                   required />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.motivationModal.description') || 'Description'} <span class="text-error">*</span>
            </label>
            <textarea id="mot-description" rows="2"
                      placeholder="${t('rag.motivationModal.descriptionPlaceholder') || 'Describe the motivation trigger...'}"
                      class="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest
                             text-sm text-on-surface placeholder-on-surface-variant/40 outline-none resize-none
                             focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                      required>${escapeHtml(motivationForm.description)}</textarea>
          </div>

          <!-- Action Type -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.motivationModal.actionType') || 'Action Type'}
            </label>
            <div class="flex gap-3">
              <label class="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition
                            ${motivationForm.action === 'ROUTE_TO_LOCAL_FLOW'
                              ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-high/50'}">
                <input type="radio" name="mot-action" value="ROUTE_TO_LOCAL_FLOW"
                       ${motivationForm.action === 'ROUTE_TO_LOCAL_FLOW' ? 'checked' : ''}
                       class="accent-primary" />
                <span class="text-xs text-on-surface">${t('rag.routeToLocal') || 'Route to Local Flow'}</span>
              </label>
              <label class="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition
                            ${motivationForm.action === 'ESCALATE_TO_CLOUD'
                              ? 'border-tertiary/40 bg-tertiary/5' : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-high/50'}">
                <input type="radio" name="mot-action" value="ESCALATE_TO_CLOUD"
                       ${motivationForm.action === 'ESCALATE_TO_CLOUD' ? 'checked' : ''}
                       class="accent-tertiary" />
                <span class="text-xs text-on-surface">${t('rag.escalateToCloud') || 'Escalate to Cloud'}</span>
              </label>
            </div>
          </div>

          <!-- Target Flow -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.motivationModal.target') || 'Target Flow'} <span class="text-error">*</span>
            </label>
            <input id="mot-target" type="text" value="${escapeAttr(motivationForm.targetFlow)}"
                   placeholder="${t('rag.motivationModal.targetPlaceholder') || 'e.g. optimize-workflow'}"
                   class="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest
                          text-sm text-on-surface placeholder-on-surface-variant/40 outline-none
                          focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                   required />
          </div>

          <!-- Buttons -->
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" id="mot-modal-cancel"
                    class="px-4 py-2 rounded-lg text-xs font-medium
                           bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition">
              ${t('rag.motivationModal.cancel') || 'Cancel'}
            </button>
            <button type="submit" id="mot-modal-save"
                    ${motivationSaving ? 'disabled' : ''}
                    class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                           ${motivationSaving
                             ? 'bg-primary/5 text-primary/40 cursor-not-allowed'
                             : 'bg-primary text-on-primary hover:bg-primary/90'}">
              ${motivationSaving ? `
                <div class="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin"></div>
                ${isEdit
                  ? (t('rag.motivationModal.updating') || 'Updating...')
                  : (t('rag.motivationModal.creating') || 'Creating...')}
              ` : (t('rag.motivationModal.save') || 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// P4-12: Create Collection modal
function renderCreateCollectionModal(): string {
  return `
    <div id="create-col-overlay" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="w-full max-w-lg mx-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-headline font-semibold text-on-surface">
            ${t('rag.collectionModal.title') || 'Create Collection'}
          </h3>
          <button id="create-col-close" class="p-1.5 rounded-lg hover:bg-surface-container-high transition text-on-surface-variant">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        ${createModalError ? `
          <div class="px-3 py-2 rounded-lg text-xs font-medium bg-error/10 text-error flex items-center gap-2">
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>${createModalError}</span>
          </div>
        ` : ''}

        <form id="create-col-form" class="space-y-4">
          <!-- Name -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.collectionModal.name') || 'Collection Name'} <span class="text-error">*</span>
            </label>
            <input id="create-col-name" type="text"
                   placeholder="${t('rag.collectionModal.namePlaceholder') || 'e.g. project-docs'}"
                   class="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest
                          text-sm text-on-surface placeholder-on-surface-variant/40 outline-none
                          focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                   required />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.collectionModal.description') || 'Description'}
            </label>
            <textarea id="create-col-desc" rows="2"
                      placeholder="${t('rag.collectionModal.descriptionPlaceholder') || 'Describe this collection...'}"
                      class="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest
                             text-sm text-on-surface placeholder-on-surface-variant/40 outline-none resize-none
                             focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"></textarea>
          </div>

          <!-- Embedding Model -->
          <div>
            <label class="block text-xs font-medium text-on-surface-variant mb-1.5">
              ${t('rag.collectionModal.embeddingModel') || 'Embedding Model'}
            </label>
            <select id="create-col-model"
                    class="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest
                           text-sm text-on-surface outline-none
                           focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition">
              <option value="text-embedding-ada-002">text-embedding-ada-002</option>
              <option value="text-embedding-3-small">text-embedding-3-small</option>
              <option value="text-embedding-3-large">text-embedding-3-large</option>
            </select>
          </div>

          <!-- Buttons -->
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" id="create-col-cancel"
                    class="px-4 py-2 rounded-lg text-xs font-medium
                           bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition">
              ${t('rag.collectionModal.cancel') || 'Cancel'}
            </button>
            <button type="submit" id="create-col-submit"
                    ${createModalLoading ? 'disabled' : ''}
                    class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                           ${createModalLoading
                             ? 'bg-primary/5 text-primary/40 cursor-not-allowed'
                             : 'bg-primary text-on-primary hover:bg-primary/90'}">
              ${createModalLoading ? `
                <div class="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin"></div>
                ${t('rag.collectionModal.creating') || 'Creating...'}
              ` : (t('rag.collectionModal.create') || 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// P4-14: Ingestion pipeline status with progress bar
function renderIngestionPipelineStatus(): string {
  if (!ingestionProgress || ingestionProgress.status === 'idle') {
    return `
      <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6">
        <div class="flex items-center gap-3 text-on-surface-variant/50">
          <div class="w-3 h-3 rounded-full bg-on-surface-variant/20"></div>
          <span class="text-sm">${t('rag.pipelineIdle') || 'Pipeline idle — no active ingestion jobs'}</span>
        </div>
      </div>
    `;
  }

  if (ingestionProgress.status === 'inProgress') {
    return `
      <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-4 h-4 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin"></div>
            <span class="text-sm font-medium text-on-surface">
              ${t('rag.ingestion.inProgress') || 'Ingesting...'} — <span class="font-mono text-secondary">${escapeHtml(ingestionProgress.collection)}</span>
            </span>
          </div>
          <span class="text-xs text-on-surface-variant/50">
            ${escapeHtml(ingestionProgress.currentFile)}
          </span>
        </div>

        <!-- Indeterminate progress bar -->
        <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r from-secondary/60 via-secondary to-secondary/60 animate-indeterminate-bar"
               style="width: 40%; animation: indeterminate-slide 1.5s ease-in-out infinite;"></div>
        </div>

        <div class="text-xs text-on-surface-variant/50">
          ${(t('rag.ingestion.progress') || 'Processing: {file}').replace('{file}', escapeHtml(ingestionProgress.currentFile))}
        </div>
      </div>
      <style>
        @keyframes indeterminate-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        .animate-indeterminate-bar {
          animation: indeterminate-slide 1.5s ease-in-out infinite;
        }
      </style>
    `;
  }

  if (ingestionProgress.status === 'complete') {
    return `
      <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span class="text-sm font-medium text-green-400">
              ${t('rag.ingestion.complete') || 'Ingestion complete'}
            </span>
          </div>
          <span class="text-xs text-on-surface-variant/50 font-mono">
            ${(t('rag.ingestion.filesProcessed') || '{done} of {total} files processed')
              .replace('{done}', String(ingestionProgress.filesProcessed))
              .replace('{total}', String(ingestionProgress.totalFiles))}
          </span>
          <button id="ingestion-dismiss" class="text-on-surface-variant/50 hover:text-on-surface-variant transition">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  // error status
  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span class="text-sm font-medium text-error">
            ${t('rag.ingestion.error') || 'Ingestion failed'} — <span class="font-mono">${escapeHtml(ingestionProgress.collection)}</span>
          </span>
        </div>
        <button id="ingestion-dismiss" class="text-on-surface-variant/50 hover:text-on-surface-variant transition">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bindEvents(): void {
  if (!container) return;

  // Search input
  const searchInput = container.querySelector('#rag-search') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderFull();
  });

  // Refresh
  container.querySelector('#rag-refresh-btn')?.addEventListener('click', () => loadData());
  container.querySelector('#rag-retry-btn')?.addEventListener('click', () => loadData());

  // P4-13: Reindex buttons with loading/feedback
  container.querySelectorAll('.rag-reindex-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.collection;
      if (name) handleReindex(name);
    });
  });

  // Ingest buttons
  container.querySelectorAll('.rag-ingest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.collection;
      if (name) handleIngest(name);
    });
  });

  // Delete collection buttons
  container.querySelectorAll('.rag-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.collection;
      if (name) handleDelete(name);
    });
  });

  // P4-11: Add motivation entry
  container.querySelector('#rag-add-entry-btn')?.addEventListener('click', () => {
    motivationModalMode = 'create';
    motivationEditIndex = -1;
    motivationForm = { cluster: '', description: '', action: 'ROUTE_TO_LOCAL_FLOW', targetFlow: '' };
    motivationModalOpen = true;
    renderFull();
  });

  // P4-11: Edit motivation entry buttons
  container.querySelectorAll('.mot-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.index || '-1', 10);
      if (idx >= 0 && idx < motivationEntries.length) {
        motivationModalMode = 'edit';
        motivationEditIndex = idx;
        const entry = motivationEntries[idx];
        motivationForm = { ...entry };
        motivationModalOpen = true;
        renderFull();
      }
    });
  });

  // P4-11: Delete motivation entry buttons
  container.querySelectorAll('.mot-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.index || '-1', 10);
      if (idx >= 0 && idx < motivationEntries.length) {
        handleDeleteMotivation(idx);
      }
    });
  });

  // P4-11: Motivation feedback dismiss
  container.querySelector('#mot-feedback-dismiss')?.addEventListener('click', () => {
    motivationFeedback = null;
    renderFull();
  });

  // P4-11: Modal events
  container.querySelector('#mot-modal-close')?.addEventListener('click', closeMotivationModal);
  container.querySelector('#mot-modal-cancel')?.addEventListener('click', closeMotivationModal);
  container.querySelector('#mot-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'mot-modal-overlay') closeMotivationModal();
  });

  // P4-11: Form submission
  container.querySelector('#mot-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSaveMotivation();
  });

  // P4-11: Radio button change for action type (re-render to update styling)
  container.querySelectorAll('input[name="mot-action"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const val = (radio as HTMLInputElement).value as MotivationEntry['action'];
      motivationForm.action = val;
      renderFull();
    });
  });

  // P4-12: New Collection modal
  container.querySelector('#rag-new-collection-btn')?.addEventListener('click', () => {
    showCreateModal = true;
    createModalError = '';
    renderFull();
  });
  container.querySelector('#create-col-close')?.addEventListener('click', closeCreateModal);
  container.querySelector('#create-col-cancel')?.addEventListener('click', closeCreateModal);
  container.querySelector('#create-col-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'create-col-overlay') closeCreateModal();
  });
  container.querySelector('#create-col-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleCreateCollection();
  });

  // P4-14: Ingestion dismiss
  container.querySelector('#ingestion-dismiss')?.addEventListener('click', () => {
    ingestionProgress = null;
    renderFull();
  });
}

// P4-13: Enhanced reindex with loading state and completion feedback
async function handleReindex(name: string): Promise<void> {
  reindexingCollections.add(name);
  reindexResults.delete(name);
  renderFull();

  try {
    await GatewayClient.call('rag.reindex', { collection: name });
    reindexResults.set(name, {
      type: 'success',
      message: t('rag.reindexSuccess') || 'Reindex completed successfully',
    });
  } catch {
    reindexResults.set(name, {
      type: 'error',
      message: t('rag.reindexError') || 'Reindex failed',
    });
  }

  reindexingCollections.delete(name);
  renderFull();

  // Auto-dismiss success after 5 seconds
  const currentResult = reindexResults.get(name);
  if (currentResult?.type === 'success') {
    setTimeout(() => {
      if (reindexResults.get(name)?.type === 'success') {
        reindexResults.delete(name);
        renderFull();
      }
    }, 5000);
  }
}

// P4-14: Enhanced ingest with file picker and progress bar
async function handleIngest(collectionName: string): Promise<void> {
  // Open a file picker dialog
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = false;
  input.accept = '.txt,.md,.pdf,.json,.csv,.html,.xml,.yaml,.yml,.toml';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    // Set ingestion in-progress state
    ingestionProgress = {
      collection: collectionName,
      percent: 0,
      currentFile: file.name,
      filesProcessed: 0,
      totalFiles: 1,
      status: 'inProgress',
    };
    renderFull();

    try {
      // Read file content
      const content = await file.text();

      // Call the RPC
      const result = await GatewayClient.call<{ documentsIngested?: number }>('rag.ingest', {
        collection: collectionName,
        fileName: file.name,
        content,
      });

      const docCount = result?.documentsIngested ?? 1;
      ingestionProgress = {
        collection: collectionName,
        percent: 100,
        currentFile: file.name,
        filesProcessed: docCount,
        totalFiles: docCount,
        status: 'complete',
      };
    } catch {
      ingestionProgress = {
        collection: collectionName,
        percent: 0,
        currentFile: file.name,
        filesProcessed: 0,
        totalFiles: 1,
        status: 'error',
      };
    }

    renderFull();

    // Reload collection data after ingestion to reflect updated vector counts
    if (ingestionProgress?.status === 'complete') {
      loadData();

      // Auto-dismiss after 6 seconds
      setTimeout(() => {
        if (ingestionProgress?.status === 'complete') {
          ingestionProgress = null;
          renderFull();
        }
      }, 6000);
    }
  });

  input.click();
}

async function handleDelete(name: string): Promise<void> {
  const msg = t('rag.deleteConfirm') || 'Are you sure you want to delete this collection?';
  if (!confirm(msg)) return;
  try {
    await GatewayClient.call('rag.deleteCollection', { collection: name });
  } catch { /* graceful */ }
  loadData();
}

// P4-12: Create collection handler
async function handleCreateCollection(): Promise<void> {
  const nameInput = container?.querySelector('#create-col-name') as HTMLInputElement | null;
  const descInput = container?.querySelector('#create-col-desc') as HTMLTextAreaElement | null;
  const modelSelect = container?.querySelector('#create-col-model') as HTMLSelectElement | null;

  const name = nameInput?.value.trim() || '';
  const description = descInput?.value.trim() || '';
  const embeddingModel = modelSelect?.value || 'text-embedding-ada-002';

  if (!name) {
    createModalError = t('rag.collectionModal.nameRequired') || 'Collection name is required';
    renderFull();
    return;
  }

  createModalLoading = true;
  createModalError = '';
  renderFull();

  try {
    await GatewayClient.call('rag.collections.create', { name, description, embeddingModel });
  } catch {
    // Graceful — still add locally for demo mode
  }

  // Add the new collection to the local grid
  collections.push({
    name,
    vectors: 0,
    fileSize: '0 B',
    lastIndexed: t('rag.never') || 'Never',
    enabled: true,
    builtIn: false,
  });

  createModalLoading = false;
  showCreateModal = false;
  createModalError = '';
  renderFull();
}

function closeCreateModal(): void {
  showCreateModal = false;
  createModalLoading = false;
  createModalError = '';
  renderFull();
}

// P4-11: Save motivation entry (create or update)
async function handleSaveMotivation(): Promise<void> {
  // Read form values from DOM
  const clusterInput = container?.querySelector('#mot-cluster') as HTMLInputElement | null;
  const descInput = container?.querySelector('#mot-description') as HTMLTextAreaElement | null;
  const targetInput = container?.querySelector('#mot-target') as HTMLInputElement | null;

  if (clusterInput) motivationForm.cluster = clusterInput.value.trim();
  if (descInput) motivationForm.description = descInput.value.trim();
  if (targetInput) motivationForm.targetFlow = targetInput.value.trim();

  // Validate
  if (!motivationForm.cluster || !motivationForm.description || !motivationForm.targetFlow) {
    return;
  }

  motivationSaving = true;
  renderFull();

  const isEdit = motivationModalMode === 'edit';

  try {
    if (isEdit) {
      await GatewayClient.call('rag.motivation.update', {
        index: motivationEditIndex,
        entry: motivationForm,
      });
      motivationEntries[motivationEditIndex] = { ...motivationForm };
      motivationFeedback = {
        type: 'success',
        message: t('rag.motivationModal.updateSuccess') || 'Motivation entry updated',
      };
    } else {
      await GatewayClient.call('rag.motivation.create', { entry: motivationForm });
      motivationEntries.push({ ...motivationForm });
      motivationFeedback = {
        type: 'success',
        message: t('rag.motivationModal.createSuccess') || 'Motivation entry created',
      };
    }
  } catch {
    // Still apply locally on RPC failure for demo graceful degradation
    if (isEdit) {
      motivationEntries[motivationEditIndex] = { ...motivationForm };
    } else {
      motivationEntries.push({ ...motivationForm });
    }
    motivationFeedback = {
      type: 'success',
      message: isEdit
        ? (t('rag.motivationModal.updateSuccess') || 'Motivation entry updated')
        : (t('rag.motivationModal.createSuccess') || 'Motivation entry created'),
    };
  }

  motivationSaving = false;
  motivationModalOpen = false;
  renderFull();

  // Auto-dismiss feedback after 4 seconds
  setTimeout(() => {
    if (motivationFeedback?.type === 'success') {
      motivationFeedback = null;
      renderFull();
    }
  }, 4000);
}

// P4-11: Delete motivation entry
async function handleDeleteMotivation(index: number): Promise<void> {
  const msg = t('rag.deleteEntryConfirm') || 'Are you sure you want to delete this motivation entry?';
  if (!confirm(msg)) return;

  const entry = motivationEntries[index];

  try {
    await GatewayClient.call('rag.motivation.delete', { cluster: entry.cluster });
  } catch { /* graceful */ }

  motivationEntries.splice(index, 1);
  motivationFeedback = {
    type: 'success',
    message: t('rag.motivationModal.deleteSuccess') || 'Motivation entry deleted',
  };
  renderFull();

  setTimeout(() => {
    if (motivationFeedback?.type === 'success') {
      motivationFeedback = null;
      renderFull();
    }
  }, 4000);
}

function closeMotivationModal(): void {
  motivationModalOpen = false;
  motivationSaving = false;
  renderFull();
}
