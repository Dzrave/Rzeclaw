/**
 * Structured per-turn log for observability.
 * No external service; writes to stdout as JSON lines or to an optional file.
 */

export type TurnLogEntry = {
  ts: string;
  session_id: string;
  turn: number;
  user_message_len: number;
  response_len: number;
  tool_calls: Array<{ name: string; ok: boolean }>;
  duration_ms: number;
};

const noop = (_: TurnLogEntry) => {};

let sink: (entry: TurnLogEntry) => void = (entry) => {
  try {
    process.stdout.write(JSON.stringify(entry) + "\n");
  } catch {
    // ignore
  }
};

export function setTurnLogSink(fn: (entry: TurnLogEntry) => void): void {
  sink = fn;
}

export function disableTurnLog(): void {
  sink = noop;
}

export function logTurn(entry: TurnLogEntry): void {
  sink(entry);
}
