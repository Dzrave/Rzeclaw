import type { RzeclawConfig } from "../config.js";
export type Message = {
    role: "user" | "assistant";
    content: string;
};
export declare function runAgentLoop(params: {
    config: RzeclawConfig;
    userMessage: string;
    sessionMessages: Message[];
    onText?: (chunk: string) => void;
}): Promise<{
    content: string;
    messages: Message[];
}>;
