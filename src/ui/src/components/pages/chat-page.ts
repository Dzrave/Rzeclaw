/**
 * Chat Terminal Page — Screen 01
 * Main chat interface: message display, streaming, session management
 */

import { t, ensureNamespace } from '../../i18n/index.js';
import { GatewayClient } from '../../lib/gateway-client.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  streaming?: boolean;
}

// ── State ──
let messages: ChatMessage[] = [];
let sessionId = 'main';
let isStreaming = false;
let container: HTMLElement | null = null;
let unsubscribeState: (() => void) | undefined;
let privacyMode = false;
let attachedFile: File | null = null;
let suggestionsExpanded = true;

// ── Render ──
export function render(el: HTMLElement): void {
  container = el;
  ensureNamespace('chat');
  messages = [];
  renderFull();
  bindEvents();

  // Listen for connection changes
  unsubscribeState = GatewayClient.onStateChange(() => {
    updateConnectionBadge();
  });
}

export function cleanup(): void {
  container = null;
  unsubscribeState?.();
  unsubscribeState = undefined;
}

function renderFull(): void {
  if (!container) return;

  container.innerHTML = `
    <div class="flex h-full">
      <!-- Session Sidebar -->
      <div class="w-56 shrink-0 border-r border-outline-variant/20 bg-surface-container-lowest flex flex-col">
        <div class="px-3 py-3 border-b border-outline-variant/20">
          <button id="new-session-btn"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                         bg-primary/10 text-primary hover:bg-primary/20 transition">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14m-7-7h14"/>
            </svg>
            ${t('chat.newSession') || '新建会话'}
          </button>
        </div>
        <div id="session-list" class="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          <div class="px-2 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium truncate cursor-pointer">
            main
          </div>
        </div>
      </div>

      <!-- Chat Main -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Header Bar: Connection + Privacy + Snapshot -->
        <div class="px-4 py-1.5 text-xs border-b border-outline-variant/10 bg-surface-container-low flex items-center gap-3">
          <div id="connection-badge" class="flex-1"></div>

          <!-- P2-12: Snapshot Save -->
          <button id="save-snapshot-btn"
                  class="relative flex items-center gap-1 px-2 py-1 rounded-md text-on-surface-variant/70
                         hover:bg-surface-container-high hover:text-on-surface transition text-xs"
                  title="${t('chat.saveSnapshot') || 'Save Snapshot'}">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm4 0v6h6V3M7 21v-8h10v8"/>
            </svg>
            ${t('chat.saveSnapshot') || 'Save Snapshot'}
            <span id="snapshot-feedback" class="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-success text-on-primary text-xs whitespace-nowrap opacity-0 pointer-events-none transition-opacity"></span>
          </button>

          <!-- P2-11: Privacy Toggle -->
          <button id="privacy-toggle-btn"
                  class="flex items-center gap-1 px-2 py-1 rounded-md transition text-xs
                         ${privacyMode
                           ? 'bg-warning/20 text-warning'
                           : 'text-on-surface-variant/70 hover:bg-surface-container-high hover:text-on-surface'}"
                  title="${privacyMode ? t('chat.privacy.on') : t('chat.privacy.off')}">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            ${privacyMode ? (t('chat.privacy.badge') || 'PRIVATE') : (t('chat.privacy.enabled') || 'Privacy')}
          </button>
        </div>

        <!-- Messages -->
        <div id="messages-area" class="flex-1 overflow-y-auto">
          ${messages.length === 0 ? renderWelcome() : renderMessages()}
        </div>

        <!-- P2-14: Proactive Suggestion Panel -->
        <div id="suggestions-panel" class="border-t border-outline-variant/20 bg-surface-container-low ${suggestionsExpanded ? '' : 'hidden'}">
          <div class="max-w-4xl mx-auto px-4 py-2">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs text-on-surface-variant/50 font-label">${t('chat.suggestions.title') || 'Suggestions'}</span>
              <button id="toggle-suggestions-btn" class="text-xs text-on-surface-variant/40 hover:text-on-surface-variant transition">
                ${t('chat.suggestions.collapse') || 'Hide'}
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${renderSuggestionChips()}
            </div>
          </div>
        </div>

        <!-- Input Bar -->
        <div class="border-t border-outline-variant/30 bg-surface-container p-3">
          <!-- P2-15: File Attachment Chip -->
          ${attachedFile ? `
          <div class="max-w-4xl mx-auto mb-2">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/10 text-secondary text-xs">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
              </svg>
              <span class="max-w-[200px] truncate">${escapeHtml(attachedFile.name)}</span>
              <button id="remove-attachment-btn" class="ml-1 hover:text-error transition" title="${t('chat.attach.remove') || 'Remove'}">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
          ` : ''}
          <div class="flex items-end gap-2 max-w-4xl mx-auto">
            <!-- P2-13: Session Type Selector (enhanced) -->
            <div class="shrink-0">
              <select id="session-type-select"
                      class="h-10 px-2 rounded-lg bg-surface-container-high text-xs text-on-surface-variant
                             border border-outline-variant/30 focus:border-primary outline-none">
                <option value="general">${sessionTypeIcon('general')} ${t('chat.sessionType.general') || 'General'}</option>
                <option value="dev">${sessionTypeIcon('dev')} ${t('chat.sessionType.dev') || 'Dev'}</option>
                <option value="knowledge">${sessionTypeIcon('knowledge')} ${t('chat.sessionType.knowledge') || 'Knowledge'}</option>
                <option value="pm">${sessionTypeIcon('pm')} ${t('chat.sessionType.pm') || 'PM'}</option>
                <option value="swarm_manager">${sessionTypeIcon('swarm_manager')} ${t('chat.sessionType.swarm') || 'Swarm'}</option>
              </select>
            </div>

            <!-- Text Input -->
            <div class="flex-1 relative">
              <textarea id="chat-input"
                        rows="1"
                        placeholder="${t('chat.inputPlaceholder') || '输入消息… (Enter 发送, Shift+Enter 换行)'}"
                        class="w-full px-4 py-2.5 rounded-xl bg-surface-container-high
                               text-on-surface text-sm placeholder:text-on-surface-variant/50
                               border border-outline-variant/30 focus:border-primary
                               focus:outline-none transition-colors resize-none
                               max-h-40 overflow-y-auto leading-relaxed"
              ></textarea>
            </div>

            <!-- P2-15: File Attach Button -->
            <button id="attach-btn"
                    class="shrink-0 w-10 h-10 rounded-xl bg-surface-container-high text-on-surface-variant
                           flex items-center justify-center hover:bg-primary/10 hover:text-primary
                           border border-outline-variant/30 transition"
                    title="${t('chat.attach') || 'Attach File'}">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
              </svg>
            </button>
            <input id="file-input" type="file" class="hidden" />

            <!-- P2-16: Undo Button (only when messages exist) -->
            ${messages.length > 0 ? `
            <button id="undo-btn"
                    class="relative shrink-0 w-10 h-10 rounded-xl bg-surface-container-high text-on-surface-variant
                           flex items-center justify-center hover:bg-warning/10 hover:text-warning
                           border border-outline-variant/30 transition
                           disabled:opacity-40 disabled:cursor-not-allowed"
                    title="${t('chat.undo') || 'Undo Last Operation'}"
                    ${isStreaming ? 'disabled' : ''}>
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/>
              </svg>
              <span id="undo-feedback" class="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-success text-on-primary text-xs whitespace-nowrap opacity-0 pointer-events-none transition-opacity"></span>
            </button>
            ` : ''}

            <!-- Send Button -->
            <button id="send-btn"
                    class="shrink-0 w-10 h-10 rounded-xl bg-primary text-on-primary
                           flex items-center justify-center hover:bg-primary-dim transition
                           disabled:bg-primary/20 disabled:text-primary/40 disabled:cursor-not-allowed"
                    ${isStreaming ? 'disabled' : ''}>
              ${isStreaming ? spinnerSvg() : sendSvg()}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  updateConnectionBadge();
  scrollToBottom();
}

function renderWelcome(): string {
  return `
    <div class="flex flex-col items-center justify-center h-full gap-4 px-4">
      <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <svg class="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227
               1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14
               1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233
               2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394
               48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25
               5.14 2.25 6.741v6.018Z" />
        </svg>
      </div>
      <h2 class="text-2xl font-headline font-bold text-on-surface">
        ${t('common.app.name')}
      </h2>
      <p class="text-sm text-on-surface-variant/60 text-center max-w-md">
        ${t('chat.welcomeMessage') || 'Intelligent Monolith — 与你的 AI 智能体对话，管理工作流，探索知识。'}
      </p>
      <div class="flex flex-wrap gap-2 mt-2">
        ${['帮我分析项目结构', '运行代码审查', '查看系统状态'].map(hint => `
          <button class="quick-hint px-3 py-1.5 rounded-lg bg-surface-container-high text-sm text-on-surface-variant
                         hover:bg-primary/10 hover:text-primary border border-outline-variant/30 transition">
            ${hint}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMessages(): string {
  return `
    <div class="max-w-4xl mx-auto py-4 px-4 space-y-4">
      ${messages.map(renderMessage).join('')}
    </div>
  `;
}

function renderMessage(msg: ChatMessage): string {
  const isUser = msg.role === 'user';
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isUser) {
    return `
      <div class="flex justify-end">
        <div class="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary/15 text-on-surface">
          <div class="text-sm whitespace-pre-wrap break-words">${escapeHtml(msg.content)}</div>
          <div class="text-xs text-on-surface-variant/40 mt-1 text-right">${time}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="flex justify-start">
      <div class="max-w-[85%]">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center">
            <svg class="w-3.5 h-3.5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3 3 3 0 0 1-1 5.83V17a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-1.17A3 3 0 0 1 5 10a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z"/>
            </svg>
          </div>
          <span class="text-xs text-on-surface-variant/60 font-label">RezBot</span>
        </div>
        <div class="px-4 py-2.5 rounded-2xl rounded-bl-md bg-surface-container-high text-on-surface">
          <div class="text-sm whitespace-pre-wrap break-words chat-markdown">${formatAssistantContent(msg.content)}</div>
          ${msg.streaming ? '<span class="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5"></span>' : ''}
          <div class="text-xs text-on-surface-variant/40 mt-1">${time}</div>
        </div>
      </div>
    </div>
  `;
}

// ── Events ──
function bindEvents(): void {
  if (!container) return;

  const input = container.querySelector('#chat-input') as HTMLTextAreaElement;
  const sendBtn = container.querySelector('#send-btn') as HTMLButtonElement;

  // Auto-resize textarea
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  // Enter to send, Shift+Enter for newline
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn?.addEventListener('click', () => sendMessage());

  // Quick hints
  container.querySelectorAll('.quick-hint').forEach(el => {
    el.addEventListener('click', () => {
      const hint = el.textContent?.trim();
      if (hint && input) {
        input.value = hint;
        sendMessage();
      }
    });
  });

  // P2-11: Privacy toggle
  const privacyBtn = container.querySelector('#privacy-toggle-btn');
  privacyBtn?.addEventListener('click', () => {
    privacyMode = !privacyMode;
    renderFull();
    bindEvents();
  });

  // P2-12: Save snapshot
  const snapshotBtn = container.querySelector('#save-snapshot-btn');
  snapshotBtn?.addEventListener('click', async () => {
    try {
      await GatewayClient.call('session.snapshot.save', { sessionId });
      const feedback = container?.querySelector('#snapshot-feedback') as HTMLElement;
      if (feedback) {
        feedback.textContent = t('chat.snapshotSaved') || 'Saved!';
        feedback.classList.remove('opacity-0');
        feedback.classList.add('opacity-100');
        setTimeout(() => {
          feedback.classList.remove('opacity-100');
          feedback.classList.add('opacity-0');
        }, 1500);
      }
    } catch (_err) {
      // silent
    }
  });

  // P2-14: Suggestion chips
  container.querySelectorAll('.suggestion-chip').forEach(el => {
    el.addEventListener('click', () => {
      const text = el.getAttribute('data-suggestion') || el.textContent?.trim();
      if (text && input) {
        input.value = text;
        input.focus();
      }
    });
  });

  const toggleSuggestionsBtn = container.querySelector('#toggle-suggestions-btn');
  toggleSuggestionsBtn?.addEventListener('click', () => {
    suggestionsExpanded = !suggestionsExpanded;
    const panel = container?.querySelector('#suggestions-panel');
    if (panel) {
      panel.classList.toggle('hidden', !suggestionsExpanded);
    }
  });

  // P2-16: Undo button
  const undoBtn = container.querySelector('#undo-btn');
  undoBtn?.addEventListener('click', async () => {
    if (isStreaming) return;
    try {
      await GatewayClient.call('chat.undo', { sessionId });
      const feedback = container?.querySelector('#undo-feedback') as HTMLElement;
      if (feedback) {
        feedback.textContent = t('chat.undo.success') || 'Undone!';
        feedback.classList.remove('opacity-0');
        feedback.classList.add('opacity-100');
        setTimeout(() => {
          feedback.classList.remove('opacity-100');
          feedback.classList.add('opacity-0');
        }, 1500);
      }
      // Remove last assistant+user message pair
      if (messages.length >= 2 && messages[messages.length - 1].role === 'assistant') {
        messages.pop();
        messages.pop();
      } else if (messages.length >= 1) {
        messages.pop();
      }
      // Full re-render if no messages left (hides undo button)
      if (messages.length === 0) {
        renderFull();
        bindEvents();
      } else {
        refreshMessages();
      }
    } catch (_err) {
      const feedback = container?.querySelector('#undo-feedback') as HTMLElement;
      if (feedback) {
        feedback.textContent = t('chat.undo.noOp') || 'Nothing to undo';
        feedback.classList.remove('opacity-0', 'bg-success');
        feedback.classList.add('opacity-100', 'bg-error');
        setTimeout(() => {
          feedback.classList.remove('opacity-100', 'bg-error');
          feedback.classList.add('opacity-0', 'bg-success');
        }, 1500);
      }
    }
  });

  // P2-15: File attachment
  const attachBtn = container.querySelector('#attach-btn');
  const fileInput = container.querySelector('#file-input') as HTMLInputElement;
  attachBtn?.addEventListener('click', () => {
    fileInput?.click();
  });
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      attachedFile = file;
      renderFull();
      bindEvents();
    }
  });
  const removeAttachBtn = container.querySelector('#remove-attachment-btn');
  removeAttachBtn?.addEventListener('click', () => {
    attachedFile = null;
    renderFull();
    bindEvents();
  });
}

async function sendMessage(): Promise<void> {
  if (!container || isStreaming) return;

  const input = container.querySelector('#chat-input') as HTMLTextAreaElement;
  const text = input?.value.trim();
  if (!text) return;

  const sessionType = (container.querySelector('#session-type-select') as HTMLSelectElement)?.value;

  // P2-15: Upload attached file if present
  let attachmentId: string | undefined;
  if (attachedFile) {
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(attachedFile!);
      });
      const uploadResult = await GatewayClient.call<{ id?: string }>('file.upload', {
        name: attachedFile.name,
        data: fileData,
        sessionId,
      });
      attachmentId = uploadResult?.id;
    } catch (_uploadErr) {
      // continue without attachment
    }
    attachedFile = null;
  }

  // Add user message
  messages.push({ role: 'user', content: text, timestamp: Date.now() });
  input.value = '';
  input.style.height = 'auto';

  // Add streaming assistant placeholder
  const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now(), streaming: true };
  messages.push(assistantMsg);

  isStreaming = true;
  refreshMessages();

  // Build RPC params — P2-11: include privacyMode flag
  const rpcParams: Record<string, unknown> = {
    message: text,
    sessionId,
    sessionType,
    stream: true,
  };
  if (privacyMode) rpcParams.privacyMode = true;
  if (attachmentId) rpcParams.attachmentId = attachmentId;

  try {
    // Try streaming first
    await GatewayClient.callStream('chat', rpcParams, (chunk: unknown) => {
      const data = chunk as Record<string, unknown>;
      if (data.stream === 'text' && typeof data.chunk === 'string') {
        assistantMsg.content += data.chunk;
        refreshMessages();
      }
    }, 120_000);

    assistantMsg.streaming = false;
    if (!assistantMsg.content) {
      assistantMsg.content = '(Empty response)';
    }
  } catch (err) {
    assistantMsg.streaming = false;

    // Fallback: try non-streaming
    if (assistantMsg.content === '') {
      try {
        const fallbackParams: Record<string, unknown> = { message: text, sessionId, sessionType };
        if (privacyMode) fallbackParams.privacyMode = true;
        if (attachmentId) fallbackParams.attachmentId = attachmentId;
        const result = await GatewayClient.call<{ content?: string; error?: string }>('chat', fallbackParams);
        assistantMsg.content = result?.content ?? result?.error ?? '(No response)';
      } catch (e2) {
        assistantMsg.content = `Error: ${e2 instanceof Error ? e2.message : String(e2)}`;
        assistantMsg.role = 'system';
      }
    }
  }

  isStreaming = false;
  refreshMessages();
}

function refreshMessages(): void {
  if (!container) return;
  const area = container.querySelector('#messages-area');
  if (!area) return;

  area.innerHTML = messages.length === 0 ? renderWelcome() : renderMessages();
  scrollToBottom();

  // Update send button state
  const sendBtn = container.querySelector('#send-btn') as HTMLButtonElement;
  if (sendBtn) {
    sendBtn.disabled = isStreaming;
    sendBtn.innerHTML = isStreaming ? spinnerSvg() : sendSvg();
  }
}

function scrollToBottom(): void {
  const area = container?.querySelector('#messages-area');
  if (area) {
    requestAnimationFrame(() => {
      area.scrollTop = area.scrollHeight;
    });
  }
}

function updateConnectionBadge(): void {
  if (!container) return;
  const badge = container.querySelector('#connection-badge');
  if (!badge) return;

  const state = GatewayClient.getState();
  const dotColor = state === 'connected' ? 'bg-success' : state === 'disconnected' ? 'bg-error' : 'bg-warning animate-pulse';

  badge.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
      <span class="text-on-surface-variant/60">${t(`common.status.${state}`)}</span>
      <span class="text-on-surface-variant/30">•</span>
      <span class="text-on-surface-variant/40 font-mono">Session: ${sessionId}</span>
    </div>
  `;
}

// ── P2-13: Session Type Icons ──
function sessionTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    general:       '\u{1F4AC}',  // speech balloon
    dev:           '\u{1F6E0}',  // hammer & wrench
    knowledge:     '\u{1F4DA}',  // books
    pm:            '\u{1F4CB}',  // clipboard
    swarm_manager: '\u{1F310}',  // globe
  };
  return icons[type] || '';
}

// ── P2-14: Suggestion Chips ──
function renderSuggestionChips(): string {
  const suggestions = [
    { key: 'suggestions.summarizeToday', fallback: 'Summarize today' },
    { key: 'suggestions.checkMemory',    fallback: 'Check memory' },
    { key: 'suggestions.runDiagnostics', fallback: 'Run diagnostics' },
  ];
  return suggestions.map(s => {
    const label = t(`chat.${s.key}`) || s.fallback;
    return `<button class="suggestion-chip px-3 py-1.5 rounded-lg bg-surface-container-high text-xs
                           text-on-surface-variant hover:bg-primary/10 hover:text-primary
                           border border-outline-variant/20 transition"
                    data-suggestion="${escapeHtml(label)}">${label}</button>`;
  }).join('');
}

// ── Utilities ──
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAssistantContent(text: string): string {
  let result = escapeHtml(text);
  // Basic code block formatting
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="my-2 p-3 rounded-lg bg-surface-container-lowest text-xs font-mono overflow-x-auto border border-outline-variant/20"><code class="language-${lang}">${code}</code></pre>`;
  });
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-container-lowest text-xs font-mono text-secondary">$1</code>');
  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
  return result;
}

function sendSvg(): string {
  return `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
  </svg>`;
}

function spinnerSvg(): string {
  return `<svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>`;
}
