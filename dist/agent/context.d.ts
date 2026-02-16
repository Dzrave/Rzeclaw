/**
 * L0 context: fixed window of recent rounds; optional summary + recent 1–2 rounds.
 */
export type Message = {
    role: "user" | "assistant";
    content: string;
};
/**
 * One round = one user + one assistant message. Returns last `windowRounds` rounds (2*windowRounds messages).
 */
export declare function applyWindow(messages: Message[], windowRounds?: number): Message[];
/**
 * When sessionSummary is set and we have more than SUMMARY_RECENT_ROUNDS rounds,
 * return only last SUMMARY_RECENT_ROUNDS rounds (summary is injected into system elsewhere).
 * Otherwise return applyWindow(messages, windowRounds).
 */
export declare function buildContextMessages(params: {
    messages: Message[];
    windowRounds?: number;
    sessionSummary?: string;
}): Message[];
