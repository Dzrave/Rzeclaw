/**
 * WO-LM: 本地模型接口。意图分类（router_v1）与 Router 对接；不随包分发模型。
 */

export { localModelComplete, getLocalModelConfig } from "./client.js";
export { callIntentClassifier } from "./intent-classifier.js";
export type { CallIntentClassifierResult } from "./intent-classifier.js";
export type { RouterV1, RouterV1State } from "./types.js";
