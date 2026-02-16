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
    tool_calls: Array<{
        name: string;
        ok: boolean;
    }>;
    duration_ms: number;
};
export declare function setTurnLogSink(fn: (entry: TurnLogEntry) => void): void;
export declare function disableTurnLog(): void;
export declare function logTurn(entry: TurnLogEntry): void;
