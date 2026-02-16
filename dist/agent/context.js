/**
 * L0 context: fixed window of recent rounds; optional summary + recent 1–2 rounds.
 */
const DEFAULT_WINDOW_ROUNDS = 5;
const SUMMARY_RECENT_ROUNDS = 2;
/**
 * One round = one user + one assistant message. Returns last `windowRounds` rounds (2*windowRounds messages).
 */
export function applyWindow(messages, windowRounds = DEFAULT_WINDOW_ROUNDS) {
    const n = Math.max(0, windowRounds * 2);
    if (messages.length <= n)
        return [...messages];
    return messages.slice(-n);
}
/**
 * When sessionSummary is set and we have more than SUMMARY_RECENT_ROUNDS rounds,
 * return only last SUMMARY_RECENT_ROUNDS rounds (summary is injected into system elsewhere).
 * Otherwise return applyWindow(messages, windowRounds).
 */
export function buildContextMessages(params) {
    const { messages, windowRounds = DEFAULT_WINDOW_ROUNDS, sessionSummary } = params;
    const rounds = Math.floor(messages.length / 2);
    if (sessionSummary && rounds > SUMMARY_RECENT_ROUNDS) {
        const recentCount = SUMMARY_RECENT_ROUNDS * 2;
        return messages.slice(-recentCount);
    }
    return applyWindow(messages, windowRounds);
}
