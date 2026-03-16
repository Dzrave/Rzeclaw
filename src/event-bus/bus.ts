/**
 * Phase 14A WO-1402/1403: 进程内逻辑总线
 * - topic 订阅与发布
 * - 请求-响应关联（correlationId + 可选超时）
 * 设计依据: docs/EVENT_BUS_AS_HUB_DESIGN.md §2
 */

import type { ChatRequestEvent, ChatResponseEvent, ChatStreamEvent } from "./schema.js";
import { TOPIC_CHAT_REQUEST, TOPIC_CHAT_RESPONSE, TOPIC_CHAT_STREAM } from "./schema.js";

export type Topic = string;
export type Payload = unknown;

export type SubscriptionCallback<T = Payload> = (payload: T) => void | Promise<void>;

/** 进程内内存总线：topic → 订阅者回调列表 */
const subscribers = new Map<Topic, SubscriptionCallback[]>();

/**
 * 订阅指定 topic；收到消息时同步调用回调。
 */
export function subscribe<T = Payload>(topic: Topic, callback: SubscriptionCallback<T>): () => void {
  let list = subscribers.get(topic);
  if (!list) {
    list = [];
    subscribers.set(topic, list as SubscriptionCallback[]);
  }
  list.push(callback as SubscriptionCallback);
  return () => {
    const idx = list!.indexOf(callback as SubscriptionCallback);
    if (idx >= 0) list!.splice(idx, 1);
  };
}

/**
 * 向指定 topic 发布一条消息；所有订阅者按注册顺序同步调用。
 */
export function publish(topic: Topic, payload: Payload): void {
  const list = subscribers.get(topic);
  if (!list?.length) return;
  for (const cb of list) {
    try {
      cb(payload);
    } catch (e) {
      console.error("[rzeclaw] EventBus subscriber error:", e);
    }
  }
}

/** 等待 response 的挂起项：resolve/reject + 超时句柄 */
const pendingByCorrelationId = new Map<
  string,
  {
    resolve: (event: ChatResponseEvent) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

let responseListenerRegistered = false;

function ensureResponseListener(): void {
  if (responseListenerRegistered) return;
  responseListenerRegistered = true;
  subscribe<ChatResponseEvent>(TOPIC_CHAT_RESPONSE, (event) => {
    const pending = pendingByCorrelationId.get(event.correlationId);
    if (pending) {
      pending.resolve(event);
      clearTimeout(pending.timeoutId);
      pendingByCorrelationId.delete(event.correlationId);
    }
  });
}

const DEFAULT_RESPONSE_TIMEOUT_MS = 300_000; // 5 min

/**
 * 发布 chat.request 并等待同 correlationId 的 chat.response（或超时）。
 * 用于接入层「请求-响应」语义；内部注册 chat.response 订阅并在收到匹配后 resolve。
 */
export function requestResponse(
  request: ChatRequestEvent,
  options?: { timeoutMs?: number }
): Promise<ChatResponseEvent> {
  ensureResponseListener();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (pendingByCorrelationId.delete(request.correlationId))
        reject(new Error("Request timeout: no response within " + timeoutMs + "ms"));
    }, timeoutMs);

    pendingByCorrelationId.set(request.correlationId, {
      resolve: (event: ChatResponseEvent) => {
        clearTimeout(timeoutId);
        pendingByCorrelationId.delete(request.correlationId);
        resolve(event);
      },
      reject: (err: Error) => {
        clearTimeout(timeoutId);
        pendingByCorrelationId.delete(request.correlationId);
        reject(err);
      },
      timeoutId,
    });

    publish(TOPIC_CHAT_REQUEST, request);
  });
}

/**
 * 发布 chat.stream chunk；仅广播，无 Promise 关联。
 */
export function publishStream(event: ChatStreamEvent): void {
  publish(TOPIC_CHAT_STREAM, event);
}

/** 生成唯一 correlationId */
export function createCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export {
  TOPIC_CHAT_REQUEST,
  TOPIC_CHAT_RESPONSE,
  TOPIC_CHAT_STREAM,
};
