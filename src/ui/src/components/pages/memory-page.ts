/**
 * Memory & Retrospective — Screen 14
 * Memory architecture layers, rolling ledger, morning report, retrospective timeline
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

let container: HTMLElement | null = null;

interface MemoryLayer {
  id: string;
  labelKey: string;
  entries: number;
  size: string;
  capacityUsed: number; // 0-100
  maxCapacity: string;
}

interface LedgerDay {
  date: string;
  dayLabel: string;
  summary: string;
  pendingTasks: string[];
  isToday: boolean;
  expiringSoon: boolean;
}

interface MorningReport {
  efficiency: string; // A+, B, C, etc.
  drift: number;      // percentage
  consistency: number; // percentage
  suggestions: string[];
}

interface RetrospectiveEntry {
  date: string;
  title: string;
  status: 'complete' | 'pending' | 'partial';
  summary: string;
}

let layers: MemoryLayer[] = [];
let ledgerDays: LedgerDay[] = [];
let morningReport: MorningReport | null = null;
let retrospectives: RetrospectiveEntry[] = [];
let loading = true;
let error = '';

// P4-08: Cold Archive state
let archiveColdLoading = false;
let archiveColdResult: { type: 'success' | 'error'; message: string } | null = null;

// P4-12: Export Ledger state
let exportLedgerLoading = false;

// P4-09: Fold operation state
let foldLoading = false;
let foldResult: { type: 'success' | 'error'; message: string } | null = null;

// P4-10: Retrospective chain state
type ChainStepStatus = 'idle' | 'inProgress' | 'done' | 'error';
let chainSteps: { run: ChainStepStatus; apply: ChainStepStatus; report: ChainStepStatus } = {
  run: 'idle',
  apply: 'idle',
  report: 'idle',
};
let chainReportData: MorningReport | null = null;
let showChainReport = false;

export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('memory');
  loadData();
  renderFull();
}

export function cleanup(): void {
  container = null;
  layers = [];
  ledgerDays = [];
  morningReport = null;
  retrospectives = [];
  loading = true;
  error = '';
  archiveColdLoading = false;
  archiveColdResult = null;
  exportLedgerLoading = false;
  foldLoading = false;
  foldResult = null;
  chainSteps = { run: 'idle', apply: 'idle', report: 'idle' };
  chainReportData = null;
  showChainReport = false;
}

async function loadData(): Promise<void> {
  loading = true;
  error = '';
  renderFull();

  try {
    const [foldResultData, summaryResult] = await Promise.allSettled([
      GatewayClient.call<{ layers: MemoryLayer[]; ledger: LedgerDay[]; retrospectives: RetrospectiveEntry[] }>('memory.fold', {}),
      GatewayClient.call<{ report: MorningReport }>('memory.yesterdaySummary', {}),
    ]);

    if (foldResultData.status === 'fulfilled' && foldResultData.value?.layers) {
      layers = foldResultData.value.layers;
      ledgerDays = foldResultData.value.ledger || [];
      retrospectives = foldResultData.value.retrospectives || [];
    } else {
      // Demo data
      layers = [
        { id: 'l1', labelKey: 'memory.l1', entries: 847, size: '24.2 MB', capacityUsed: 72, maxCapacity: '32 MB' },
        { id: 'l2', labelKey: 'memory.l2', entries: 3241, size: '156 MB', capacityUsed: 48, maxCapacity: '320 MB' },
        { id: 'cold', labelKey: 'memory.cold', entries: 12580, size: '1.2 GB', capacityUsed: 23, maxCapacity: '5 GB' },
      ];

      const today = new Date();
      ledgerDays = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (4 - i));
        const isToday = i === 4;
        const expiringSoon = i === 0;
        return {
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dayLabel: isToday ? (t('memory.today') || 'Today') : d.toLocaleDateString('en-US', { weekday: 'short' }),
          summary: isToday
            ? 'Active session with 12 interactions. 3 new flows created. RAG index updated.'
            : `Completed ${8 + i} tasks. ${2 + i} flows executed. Memory consolidated.`,
          pendingTasks: isToday
            ? ['Review security audit results', 'Complete flow optimization']
            : i === 3 ? ['Pending retrospective analysis'] : [],
          isToday,
          expiringSoon,
        };
      });

      retrospectives = [
        { date: '2026-03-22', title: 'Weekly Retrospective #12', status: 'complete', summary: 'Efficiency improved 8% week-over-week. Drift within tolerance.' },
        { date: '2026-03-15', title: 'Weekly Retrospective #11', status: 'complete', summary: 'New flow patterns integrated. Memory usage optimized.' },
        { date: '2026-03-08', title: 'Weekly Retrospective #10', status: 'partial', summary: 'Partial analysis due to cold storage migration.' },
        { date: '2026-03-01', title: 'Weekly Retrospective #9', status: 'complete', summary: 'All metrics within target ranges. No corrective action needed.' },
      ];
    }

    if (summaryResult.status === 'fulfilled' && summaryResult.value?.report) {
      morningReport = summaryResult.value.report;
    } else {
      morningReport = {
        efficiency: 'A+',
        drift: 2.3,
        consistency: 97.1,
        suggestions: [
          'Consider archiving L1 entries older than 48 hours',
          'Flow "daily-standup" has low utilization — review trigger conditions',
          'RAG collection "meeting-notes" indexing is stale',
        ],
      };
    }
  } catch {
    error = t('memory.error.loadFailed') || 'Failed to load memory data';
  }

  loading = false;
  renderFull();
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="h-full overflow-y-auto">
      <div class="max-w-6xl mx-auto p-6 space-y-6">

        <!-- Header -->
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-headline font-bold text-on-surface">
            ${t('memory.title') || 'Memory & Retrospective'}
          </h1>
          <button id="mem-refresh-btn" class="px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition">
            ${t('memory.refresh') || 'Refresh'}
          </button>
        </div>

        ${loading ? `
          <div class="flex items-center justify-center py-20">
            <div class="flex items-center gap-3 text-on-surface-variant/60">
              <div class="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              <span class="text-sm">${t('memory.loading') || 'Loading...'}</span>
            </div>
          </div>
        ` : error ? `
          <div class="flex items-center justify-center py-20">
            <div class="text-center space-y-2">
              <p class="text-sm text-error">${error}</p>
              <button id="mem-retry-btn" class="text-xs text-primary hover:underline">${t('memory.refresh') || 'Refresh'}</button>
            </div>
          </div>
        ` : `
          <!-- Memory Architecture: Three-column layout -->
          <section>
            <h2 class="text-lg font-headline font-semibold text-on-surface mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
              </svg>
              ${t('memory.architecture') || 'Memory Architecture'}
            </h2>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              ${layers.map(layer => renderLayerCard(layer)).join('')}
            </div>

            <!-- Action buttons -->
            <div class="flex flex-wrap gap-3 mt-4">
              <button id="mem-promote-btn" class="px-4 py-2 rounded-lg text-xs font-medium
                             bg-primary/10 text-primary hover:bg-primary/20 transition">
                ${t('memory.promote') || 'Promote L1 -> L2'}
              </button>
              <button id="mem-archive-btn" class="px-4 py-2 rounded-lg text-xs font-medium
                             bg-secondary/10 text-secondary hover:bg-secondary/20 transition">
                ${t('memory.archive') || 'Archive Cold'}
              </button>
              <!-- P4-08: Archive to Cold Storage -->
              <button id="mem-archive-cold-btn"
                      ${archiveColdLoading ? 'disabled' : ''}
                      class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                             ${archiveColdLoading
                               ? 'bg-tertiary/5 text-tertiary/40 cursor-not-allowed'
                               : 'bg-tertiary/10 text-tertiary hover:bg-tertiary/20'}">
                ${archiveColdLoading ? `
                  <div class="w-3 h-3 border-2 border-tertiary/30 border-t-tertiary rounded-full animate-spin"></div>
                  ${t('memory.archiveColdLoading') || 'Archiving to cold storage...'}
                ` : `
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  ${t('memory.archiveCold') || 'Archive to Cold Storage'}
                `}
              </button>
              <button id="mem-purge-btn" class="px-4 py-2 rounded-lg text-xs font-medium
                             bg-error/10 text-error hover:bg-error/20 transition">
                ${t('memory.purge') || 'Purge'}
              </button>
            </div>

            <!-- P4-08: Archive cold feedback -->
            ${archiveColdResult ? `
              <div class="mt-3 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2
                          ${archiveColdResult.type === 'success' ? 'bg-green-400/10 text-green-400' : 'bg-error/10 text-error'}">
                ${archiveColdResult.type === 'success' ? `
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ` : `
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                `}
                <span>${archiveColdResult.message}</span>
                <button id="mem-archive-cold-dismiss" class="ml-auto text-current opacity-60 hover:opacity-100">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ` : ''}
          </section>

          <!-- Rolling Ledger Timeline -->
          <section>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-lg font-headline font-semibold text-on-surface flex items-center gap-2">
                  <svg class="w-5 h-5 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  ${t('memory.ledger') || 'Rolling Ledger Timeline'}
                </h2>
                <p class="text-xs text-on-surface-variant/50 mt-1">
                  ${t('memory.ledgerDesc') || '5-day rolling window of daily summaries'}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <!-- P4-12: Export Ledger -->
                <button id="mem-export-ledger-btn"
                        ${exportLedgerLoading ? 'disabled' : ''}
                        class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                               ${exportLedgerLoading
                                 ? 'bg-secondary/5 text-secondary/40 cursor-not-allowed'
                                 : 'bg-secondary/10 text-secondary hover:bg-secondary/20'}">
                  ${exportLedgerLoading ? `
                    <div class="w-3 h-3 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin"></div>
                    ${t('memory.exportLedgerLoading') || 'Exporting ledger...'}
                  ` : `
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    ${t('memory.exportLedger') || 'Export Ledger'}
                  `}
                </button>
                ${renderFoldButton()}
              </div>
            </div>

            ${renderFoldFeedback()}

            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
              ${ledgerDays.map(day => renderLedgerCard(day)).join('')}
            </div>
          </section>

          <!-- Morning Report -->
          <section>
            <h2 class="text-lg font-headline font-semibold text-on-surface mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
              ${t('memory.morningReport') || 'Morning Report'}
            </h2>
            ${morningReport ? renderMorningReport(morningReport) : `
              <div class="text-sm text-on-surface-variant/50">${t('memory.noData') || 'No data available'}</div>
            `}
          </section>

          <!-- P4-10: Retrospective Chain -->
          <section>
            <div class="mb-4">
              <h2 class="text-lg font-headline font-semibold text-on-surface flex items-center gap-2">
                <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ${t('memory.retroChain') || 'Retrospective Chain'}
              </h2>
              <p class="text-xs text-on-surface-variant/50 mt-1">
                ${t('memory.retroChainDesc') || 'Run the full retrospective pipeline'}
              </p>
            </div>

            ${renderRetroChain()}
          </section>

          <!-- Retrospective Timeline -->
          <section>
            <div class="mb-4">
              <h2 class="text-lg font-headline font-semibold text-on-surface flex items-center gap-2">
                <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ${t('memory.retrospective') || 'Retrospective Timeline'}
              </h2>
              <p class="text-xs text-on-surface-variant/50 mt-1">
                ${t('memory.retrospectiveDesc') || 'Past retrospective analyses'}
              </p>
            </div>

            <div class="space-y-3">
              ${retrospectives.map(r => renderRetrospectiveCard(r)).join('')}
            </div>
          </section>
        `}
      </div>
    </div>

    ${showChainReport && chainReportData ? renderChainReportModal(chainReportData) : ''}
  `;

  bindEvents();
}

// P4-09: Fold button with loading spinner
function renderFoldButton(): string {
  if (foldLoading) {
    return `
      <button id="mem-fold-btn" disabled class="px-4 py-2 rounded-lg text-xs font-medium
                     bg-tertiary/10 text-tertiary/50 cursor-not-allowed transition flex items-center gap-2">
        <div class="w-3.5 h-3.5 border-2 border-tertiary/30 border-t-tertiary rounded-full animate-spin"></div>
        ${t('memory.foldLoading') || 'Folding memory...'}
      </button>
    `;
  }
  return `
    <button id="mem-fold-btn" class="px-4 py-2 rounded-lg text-xs font-medium
                   bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition">
      ${t('memory.foldNow') || 'Fold Now'}
    </button>
  `;
}

// P4-09: Fold result feedback
function renderFoldFeedback(): string {
  if (!foldResult) return '';
  const isSuccess = foldResult.type === 'success';
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
      <span>${foldResult.message}</span>
      <button id="mem-fold-dismiss" class="ml-auto text-current opacity-60 hover:opacity-100">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `;
}

// P4-10: Retrospective chain with mini timeline
function renderRetroChain(): string {
  const steps: Array<{ key: keyof typeof chainSteps; label: string; icon: string }> = [
    {
      key: 'run',
      label: t('memory.stepRun') || 'Run',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />',
    },
    {
      key: 'apply',
      label: t('memory.stepApply') || 'Apply',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />',
    },
    {
      key: 'report',
      label: t('memory.stepReport') || 'Report',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />',
    },
  ];

  const statusColorMap: Record<ChainStepStatus, string> = {
    idle: 'bg-on-surface-variant/20',
    inProgress: 'bg-primary animate-pulse',
    done: 'bg-green-400',
    error: 'bg-error',
  };

  const statusLabelMap: Record<ChainStepStatus, string> = {
    idle: t('memory.chainIdle') || 'Idle',
    inProgress: t('memory.chainInProgress') || 'In Progress',
    done: t('memory.chainDone') || 'Done',
    error: t('memory.chainError') || 'Error',
  };

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 space-y-5">
      <!-- Mini timeline progress indicator -->
      <div class="flex items-center justify-between px-4">
        ${steps.map((step, i) => `
          <div class="flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}">
            <!-- Step node -->
            <div class="flex flex-col items-center gap-1.5">
              <div class="w-8 h-8 rounded-full flex items-center justify-center
                          ${chainSteps[step.key] === 'done' ? 'bg-green-400/15' :
                            chainSteps[step.key] === 'inProgress' ? 'bg-primary/15' :
                            chainSteps[step.key] === 'error' ? 'bg-error/15' :
                            'bg-surface-container-high'}">
                ${chainSteps[step.key] === 'inProgress' ? `
                  <div class="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                ` : `
                  <svg class="w-4 h-4 ${chainSteps[step.key] === 'done' ? 'text-green-400' :
                    chainSteps[step.key] === 'error' ? 'text-error' :
                    'text-on-surface-variant/50'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    ${step.icon}
                  </svg>
                `}
              </div>
              <span class="text-[10px] font-medium ${chainSteps[step.key] === 'done' ? 'text-green-400' :
                chainSteps[step.key] === 'inProgress' ? 'text-primary' :
                chainSteps[step.key] === 'error' ? 'text-error' :
                'text-on-surface-variant/50'}">
                ${step.label}
              </span>
              <span class="text-[9px] ${chainSteps[step.key] === 'idle' ? 'text-on-surface-variant/30' : 'text-on-surface-variant/50'}">
                ${statusLabelMap[chainSteps[step.key]]}
              </span>
            </div>
            <!-- Connector line -->
            ${i < steps.length - 1 ? `
              <div class="flex-1 h-0.5 mx-3 mt-[-20px] rounded-full ${
                chainSteps[steps[i + 1].key] !== 'idle' || chainSteps[step.key] === 'done'
                  ? 'bg-green-400/40' : 'bg-on-surface-variant/15'
              }"></div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      <!-- Status dots legend -->
      <div class="flex items-center justify-center gap-4 text-[10px] text-on-surface-variant/50">
        ${Object.entries(statusColorMap).map(([status, color]) => `
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full ${color}"></span>
            ${statusLabelMap[status as ChainStepStatus]}
          </span>
        `).join('')}
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3 justify-center pt-2">
        <button id="mem-retro-run-btn"
                ${chainSteps.run === 'inProgress' ? 'disabled' : ''}
                class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                       ${chainSteps.run === 'inProgress' ? 'bg-primary/5 text-primary/40 cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20'}">
          ${chainSteps.run === 'inProgress' ? `
            <div class="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          ` : ''}
          ${t('memory.runRetrospective') || 'Run Retrospective'}
        </button>
        <button id="mem-retro-apply-btn"
                ${chainSteps.apply === 'inProgress' || chainSteps.run !== 'done' ? 'disabled' : ''}
                class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                       ${chainSteps.apply === 'inProgress' || chainSteps.run !== 'done'
                         ? 'bg-secondary/5 text-secondary/40 cursor-not-allowed'
                         : 'bg-secondary/10 text-secondary hover:bg-secondary/20'}">
          ${chainSteps.apply === 'inProgress' ? `
            <div class="w-3 h-3 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin"></div>
          ` : ''}
          ${t('memory.applyPending') || 'Apply Pending'}
        </button>
        <button id="mem-retro-report-btn"
                ${chainSteps.report === 'inProgress' || chainSteps.apply !== 'done' ? 'disabled' : ''}
                class="px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2
                       ${chainSteps.report === 'inProgress' || chainSteps.apply !== 'done'
                         ? 'bg-tertiary/5 text-tertiary/40 cursor-not-allowed'
                         : 'bg-tertiary/10 text-tertiary hover:bg-tertiary/20'}">
          ${chainSteps.report === 'inProgress' ? `
            <div class="w-3 h-3 border-2 border-tertiary/30 border-t-tertiary rounded-full animate-spin"></div>
          ` : ''}
          ${t('memory.viewMorningReport') || 'View Morning Report'}
        </button>
      </div>
    </div>
  `;
}

// P4-10: Chain report modal overlay
function renderChainReportModal(report: MorningReport): string {
  const gradeColor = report.efficiency.startsWith('A')
    ? 'text-green-400'
    : report.efficiency.startsWith('B')
      ? 'text-yellow-400'
      : 'text-error';

  return `
    <div id="chain-report-overlay" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="w-full max-w-xl mx-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-headline font-semibold text-on-surface">
            ${t('memory.morningReport') || 'Morning Report'}
          </h3>
          <button id="chain-report-close" class="p-1.5 rounded-lg hover:bg-surface-container-high transition text-on-surface-variant">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Metrics -->
        <div class="grid grid-cols-3 gap-6">
          <div class="text-center">
            <div class="text-xs text-on-surface-variant/50 mb-2">${t('memory.efficiency') || 'Efficiency'}</div>
            <div class="text-4xl font-headline font-black ${gradeColor}">${report.efficiency}</div>
          </div>
          <div class="text-center">
            <div class="text-xs text-on-surface-variant/50 mb-2">${t('memory.drift') || 'Drift'}</div>
            <div class="text-2xl font-mono font-bold text-on-surface">${report.drift}%</div>
          </div>
          <div class="text-center">
            <div class="text-xs text-on-surface-variant/50 mb-2">${t('memory.consistency') || 'Consistency'}</div>
            <div class="text-2xl font-mono font-bold text-on-surface">${report.consistency}%</div>
          </div>
        </div>

        <!-- Suggestions -->
        ${report.suggestions.length > 0 ? `
          <div>
            <h4 class="text-sm font-medium text-on-surface mb-2">${t('memory.suggestions') || 'Improvement Suggestions'}</h4>
            <ul class="space-y-2">
              ${report.suggestions.map(s => `
                <li class="flex items-start gap-2 text-xs text-on-surface-variant">
                  <svg class="w-4 h-4 text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                  <span>${s}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="flex justify-end">
          <button id="chain-report-close-btn" class="px-4 py-2 rounded-lg text-xs font-medium
                         bg-primary/10 text-primary hover:bg-primary/20 transition">
            ${t('memory.closeReport') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderLayerCard(layer: MemoryLayer): string {
  const colorMap: Record<string, string> = {
    l1: 'primary',
    l2: 'secondary',
    cold: 'tertiary',
  };
  const color = colorMap[layer.id] || 'primary';
  const capPct = Math.min(100, Math.max(0, layer.capacityUsed));
  const isHigh = capPct > 80;

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-headline font-semibold text-on-surface text-sm">
          ${t(layer.labelKey) || layer.id}
        </h3>
        <span class="text-xs font-mono text-on-surface-variant/60">${layer.maxCapacity}</span>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <div class="text-xs text-on-surface-variant/50">${t('memory.entries') || 'Entries'}</div>
          <div class="text-lg font-mono font-bold text-on-surface">${layer.entries.toLocaleString()}</div>
        </div>
        <div>
          <div class="text-xs text-on-surface-variant/50">${t('memory.size') || 'Size'}</div>
          <div class="text-lg font-mono font-bold text-on-surface">${layer.size}</div>
        </div>
      </div>

      <!-- Capacity bar -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs text-on-surface-variant/50">${t('memory.capacity') || 'Capacity'}</span>
          <span class="text-xs font-mono ${isHigh ? 'text-error' : 'text-on-surface-variant'}">${capPct}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-error' : `bg-${color}`}"
               style="width: ${capPct}%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderLedgerCard(day: LedgerDay): string {
  const borderClass = day.isToday
    ? 'border-primary/40 bg-primary/5'
    : day.expiringSoon
      ? 'border-error/30 bg-error/5'
      : 'border-outline-variant/20 bg-surface-container-lowest';

  return `
    <div class="min-w-[220px] max-w-[260px] shrink-0 rounded-xl border ${borderClass} p-4 space-y-3">
      <!-- Day header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs font-medium ${day.isToday ? 'text-primary' : 'text-on-surface-variant/60'}">${day.dayLabel}</div>
          <div class="text-sm font-mono font-semibold text-on-surface">${day.date}</div>
        </div>
        ${day.isToday ? `
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary">
            ${t('memory.today') || 'Today'}
          </span>
        ` : day.expiringSoon ? `
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-error/15 text-error">
            ${t('memory.expiringSoon') || 'Expiring Soon'}
          </span>
        ` : ''}
      </div>

      <!-- Summary -->
      <p class="text-xs text-on-surface-variant leading-relaxed">${day.summary}</p>

      <!-- Pending tasks -->
      ${day.pendingTasks.length > 0 ? `
        <div>
          <div class="text-[10px] uppercase tracking-wider text-on-surface-variant/40 mb-1.5">
            ${t('memory.pendingTasks') || 'Pending Tasks'}
          </div>
          <ul class="space-y-1">
            ${day.pendingTasks.map(task => `
              <li class="text-xs text-on-surface-variant flex items-start gap-1.5">
                <span class="w-1 h-1 rounded-full bg-warning mt-1.5 shrink-0"></span>
                ${task}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : `
        <div class="text-[10px] text-on-surface-variant/30 italic">${t('memory.noTasks') || 'No pending tasks'}</div>
      `}
    </div>
  `;
}

function renderMorningReport(report: MorningReport): string {
  const gradeColor = report.efficiency.startsWith('A')
    ? 'text-green-400'
    : report.efficiency.startsWith('B')
      ? 'text-yellow-400'
      : 'text-error';

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 space-y-5">
      <!-- Top metrics -->
      <div class="grid grid-cols-3 gap-6">
        <!-- Efficiency grade -->
        <div class="text-center">
          <div class="text-xs text-on-surface-variant/50 mb-2">${t('memory.efficiency') || 'Efficiency'}</div>
          <div class="text-4xl font-headline font-black ${gradeColor}">${report.efficiency}</div>
        </div>

        <!-- Drift -->
        <div class="text-center">
          <div class="text-xs text-on-surface-variant/50 mb-2">${t('memory.drift') || 'Drift'}</div>
          <div class="text-2xl font-mono font-bold text-on-surface">${report.drift}%</div>
          <div class="w-full h-1.5 rounded-full bg-surface-container-high mt-2 overflow-hidden">
            <div class="h-full rounded-full ${report.drift < 5 ? 'bg-green-400' : report.drift < 10 ? 'bg-yellow-400' : 'bg-error'}"
                 style="width: ${Math.min(100, report.drift * 10)}%"></div>
          </div>
        </div>

        <!-- Consistency -->
        <div class="text-center">
          <div class="text-xs text-on-surface-variant/50 mb-2">${t('memory.consistency') || 'Consistency'}</div>
          <div class="text-2xl font-mono font-bold text-on-surface">${report.consistency}%</div>
          <div class="w-full h-1.5 rounded-full bg-surface-container-high mt-2 overflow-hidden">
            <div class="h-full rounded-full ${report.consistency > 90 ? 'bg-green-400' : report.consistency > 70 ? 'bg-yellow-400' : 'bg-error'}"
                 style="width: ${report.consistency}%"></div>
          </div>
        </div>
      </div>

      <!-- Suggestions -->
      <div>
        <h3 class="text-sm font-medium text-on-surface mb-3">${t('memory.suggestions') || 'Improvement Suggestions'}</h3>
        ${report.suggestions.length > 0 ? `
          <ul class="space-y-2">
            ${report.suggestions.map(s => `
              <li class="flex items-start gap-2 text-xs text-on-surface-variant">
                <svg class="w-4 h-4 text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                <span>${s}</span>
              </li>
            `).join('')}
          </ul>
        ` : `
          <p class="text-xs text-on-surface-variant/40 italic">${t('memory.noSuggestions') || 'No improvement suggestions'}</p>
        `}
      </div>
    </div>
  `;
}

function renderRetrospectiveCard(entry: RetrospectiveEntry): string {
  const statusColors: Record<string, string> = {
    complete: 'bg-green-400/10 text-green-400',
    pending: 'bg-yellow-400/10 text-yellow-400',
    partial: 'bg-orange-400/10 text-orange-400',
  };
  const statusLabel = t(`memory.status.${entry.status}`) || entry.status;

  return `
    <div class="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 flex items-start gap-4
                hover:border-outline-variant/40 transition">
      <!-- Date column -->
      <div class="shrink-0 text-center w-14">
        <div class="text-xs text-on-surface-variant/50">${entry.date.slice(5, 7)}/${entry.date.slice(8, 10)}</div>
        <div class="text-sm font-mono font-semibold text-on-surface">${entry.date.slice(0, 4)}</div>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="text-sm font-medium text-on-surface truncate">${entry.title}</h3>
          <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[entry.status] || 'bg-surface-container-high text-on-surface-variant'}">
            ${statusLabel}
          </span>
        </div>
        <p class="text-xs text-on-surface-variant/60 line-clamp-2">${entry.summary}</p>
      </div>
    </div>
  `;
}

function bindEvents(): void {
  if (!container) return;

  container.querySelector('#mem-refresh-btn')?.addEventListener('click', () => loadData());
  container.querySelector('#mem-retry-btn')?.addEventListener('click', () => loadData());

  container.querySelector('#mem-promote-btn')?.addEventListener('click', async () => {
    try { await GatewayClient.call('memory.promote', { from: 'l1', to: 'l2' }); } catch { /* graceful */ }
    loadData();
  });

  container.querySelector('#mem-archive-btn')?.addEventListener('click', async () => {
    try { await GatewayClient.call('memory.archive', { layer: 'cold' }); } catch { /* graceful */ }
    loadData();
  });

  container.querySelector('#mem-purge-btn')?.addEventListener('click', async () => {
    const msg = t('memory.purgeConfirm') || 'Are you sure you want to purge this layer?';
    if (!confirm(msg)) return;
    try { await GatewayClient.call('memory.purge', {}); } catch { /* graceful */ }
    loadData();
  });

  // P4-08: Archive to Cold Storage
  container.querySelector('#mem-archive-cold-btn')?.addEventListener('click', handleArchiveCold);
  container.querySelector('#mem-archive-cold-dismiss')?.addEventListener('click', () => {
    archiveColdResult = null;
    renderFull();
  });

  // P4-12: Export Ledger
  container.querySelector('#mem-export-ledger-btn')?.addEventListener('click', handleExportLedger);

  // P4-09: Fold Now with loading/feedback
  container.querySelector('#mem-fold-btn')?.addEventListener('click', handleFold);

  // P4-09: Dismiss fold feedback
  container.querySelector('#mem-fold-dismiss')?.addEventListener('click', () => {
    foldResult = null;
    renderFull();
  });

  // P4-10: Retrospective chain buttons
  container.querySelector('#mem-retro-run-btn')?.addEventListener('click', handleRetroRun);
  container.querySelector('#mem-retro-apply-btn')?.addEventListener('click', handleRetroApply);
  container.querySelector('#mem-retro-report-btn')?.addEventListener('click', handleRetroReport);

  // P4-10: Chain report modal close
  container.querySelector('#chain-report-close')?.addEventListener('click', closeChainReport);
  container.querySelector('#chain-report-close-btn')?.addEventListener('click', closeChainReport);
  container.querySelector('#chain-report-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'chain-report-overlay') closeChainReport();
  });
}

// P4-08: Archive to Cold Storage handler
async function handleArchiveCold(): Promise<void> {
  archiveColdLoading = true;
  archiveColdResult = null;
  renderFull();

  try {
    const workspace = 'default'; // current workspace
    const result = await GatewayClient.call<{ archivedCount?: number }>('memory.archiveCold', { workspace });
    const count = result?.archivedCount ?? 0;
    const msg = (t('memory.archiveColdSuccess') || '{count} entries archived to cold storage').replace('{count}', String(count));
    archiveColdResult = { type: 'success', message: msg };
  } catch {
    archiveColdResult = { type: 'error', message: t('memory.archiveColdError') || 'Failed to archive to cold storage' };
  }

  archiveColdLoading = false;
  renderFull();

  // Reload memory stats after success to reflect new layer counts
  if (archiveColdResult?.type === 'success') {
    loadData();

    // Auto-dismiss success after 5 seconds
    setTimeout(() => {
      if (archiveColdResult?.type === 'success') {
        archiveColdResult = null;
        renderFull();
      }
    }, 5000);
  }
}

// P4-12: Export Ledger handler
async function handleExportLedger(): Promise<void> {
  exportLedgerLoading = true;
  renderFull();

  try {
    const result = await GatewayClient.call<{ data?: string; entries?: unknown[] }>('memory.exportLedger', {});
    // Build JSONL content from the result
    let content: string;
    if (result?.data) {
      content = result.data;
    } else if (result?.entries) {
      content = result.entries.map(e => JSON.stringify(e)).join('\n');
    } else {
      // Fallback: export current ledgerDays as JSONL
      content = ledgerDays.map(d => JSON.stringify(d)).join('\n');
    }

    // Trigger browser download
    const blob = new Blob([content], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-ledger-${new Date().toISOString().slice(0, 10)}.jsonl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Silent fail — the download simply won't happen
  }

  exportLedgerLoading = false;
  renderFull();
}

// P4-09: Fold operation handler
async function handleFold(): Promise<void> {
  foldLoading = true;
  foldResult = null;
  renderFull();

  try {
    await GatewayClient.call('memory.fold', { date: 'today' });
    foldResult = { type: 'success', message: t('memory.foldSuccess') || 'Memory fold completed successfully' };
  } catch {
    foldResult = { type: 'error', message: t('memory.foldError') || 'Memory fold failed' };
  }

  foldLoading = false;
  renderFull();

  // Auto-dismiss success after 5 seconds
  if (foldResult?.type === 'success') {
    setTimeout(() => {
      if (foldResult?.type === 'success') {
        foldResult = null;
        renderFull();
      }
    }, 5000);
  }
}

// P4-10: Run retrospective
async function handleRetroRun(): Promise<void> {
  chainSteps = { run: 'inProgress', apply: 'idle', report: 'idle' };
  renderFull();

  try {
    await GatewayClient.call('retrospective.run', {});
    chainSteps.run = 'done';
  } catch {
    chainSteps.run = 'error';
  }

  renderFull();
}

// P4-10: Apply pending
async function handleRetroApply(): Promise<void> {
  chainSteps.apply = 'inProgress';
  renderFull();

  try {
    await GatewayClient.call('retrospective.applyPending', {});
    chainSteps.apply = 'done';
  } catch {
    chainSteps.apply = 'error';
  }

  renderFull();
}

// P4-10: View morning report
async function handleRetroReport(): Promise<void> {
  chainSteps.report = 'inProgress';
  renderFull();

  try {
    const result = await GatewayClient.call<{ report: MorningReport }>('memory.retrospective', {});
    chainSteps.report = 'done';
    chainReportData = result?.report || morningReport || {
      efficiency: 'A',
      drift: 3.1,
      consistency: 94.5,
      suggestions: ['Review completed retrospective for action items'],
    };
    showChainReport = true;
  } catch {
    chainSteps.report = 'error';
  }

  renderFull();
}

function closeChainReport(): void {
  showChainReport = false;
  renderFull();
}
