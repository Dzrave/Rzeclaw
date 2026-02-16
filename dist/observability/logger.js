/**
 * Structured per-turn log for observability.
 * No external service; writes to stdout as JSON lines or to an optional file.
 */
const noop = (_) => { };
let sink = (entry) => {
    try {
        process.stdout.write(JSON.stringify(entry) + "\n");
    }
    catch {
        // ignore
    }
};
export function setTurnLogSink(fn) {
    sink = fn;
}
export function disableTurnLog() {
    sink = noop;
}
export function logTurn(entry) {
    sink(entry);
}
