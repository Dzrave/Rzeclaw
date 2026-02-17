/**
 * WO-SEC-005: 敏感内容脱敏，用于 ops.log、审计导出等，避免泄露 API Key、密码、路径等。
 */

const PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk-[a-zA-Z0-9_-]{20,})/g, "[API_KEY_REDACTED]"],
  [/\b(api[_-]?key|apikey)\s*[:=]\s*["']?[^"'\s]{8,}/gi, "[API_KEY_REDACTED]"],
  [/\b(password|passwd|secret)\s*[:=]\s*["']?[^"'\s]{4,}/gi, "[SECRET_REDACTED]"],
  [/([A-Za-z]:\\[^\s]+|\\\/[^\s]+)/g, "[PATH_REDACTED]"],
];

/**
 * 对单段文本做敏感信息替换，用于写入日志或导出。
 */
export function sanitizeForLog(text: string): string {
  if (typeof text !== "string" || !text) return "";
  let s = text;
  for (const [re, replacement] of PATTERNS) {
    s = s.replace(re, replacement);
  }
  return s;
}

/**
 * 深度脱敏：对对象中所有字符串值调用 sanitizeForLog；用于 args 等。
 */
export function sanitizeObject(obj: unknown): unknown {
  if (obj == null) return obj;
  if (typeof obj === "string") return sanitizeForLog(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeObject(v);
    }
    return out;
  }
  return obj;
}
