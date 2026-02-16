/** Max chars for bash/read output before truncation (configurable via constant). */
export const DEFAULT_MAX_OUTPUT_CHARS = 32_000;
/** Max lines to keep at end when truncating by chars. */
const TAIL_LINES = 80;
/**
 * Truncate long text: keep start up to (maxChars - tail), then "... [N chars omitted] ...", then tail.
 * If maxLines is set, also ensure we don't return more than maxLines (by trimming from middle).
 */
export function compressOutput(text, maxChars = DEFAULT_MAX_OUTPUT_CHARS, maxLines) {
    if (text.length <= maxChars && (maxLines == null || text.split("\n").length <= maxLines)) {
        return text;
    }
    const lines = text.split("\n");
    const overLines = maxLines != null && lines.length > maxLines;
    if (overLines && maxLines > 0) {
        const keepStart = Math.floor(maxLines * 0.4);
        const keepEnd = maxLines - keepStart - 1;
        const omitted = lines.length - keepStart - keepEnd;
        const head = lines.slice(0, keepStart).join("\n");
        const tail = lines.slice(-keepEnd).join("\n");
        return `${head}\n... (${omitted} lines omitted) ...\n${tail}`;
    }
    const tailCharCount = Math.min(maxChars >> 1, TAIL_LINES * 120);
    const headCharCount = maxChars - tailCharCount - 50; // reserve for "... [N chars omitted] ..."
    if (text.length <= maxChars)
        return text;
    const head = text.slice(0, headCharCount);
    const tail = text.slice(-tailCharCount);
    const omitted = text.length - headCharCount - tailCharCount;
    return `${head}\n... (${omitted} chars omitted) ...\n${tail}`;
}
