/** Max chars for bash/read output before truncation (configurable via constant). */
export declare const DEFAULT_MAX_OUTPUT_CHARS = 32000;
/**
 * Truncate long text: keep start up to (maxChars - tail), then "... [N chars omitted] ...", then tail.
 * If maxLines is set, also ensure we don't return more than maxLines (by trimming from middle).
 */
export declare function compressOutput(text: string, maxChars?: number, maxLines?: number): string;
