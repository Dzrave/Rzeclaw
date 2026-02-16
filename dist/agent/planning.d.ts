/**
 * WO-403: 轻量规划。对复杂请求先让模型输出步骤列表（不执行），再在上下文中按步执行。
 */
import type { RzeclawConfig } from "../config.js";
/**
 * 判断是否为「复杂请求」（需先规划再执行）。
 */
export declare function isComplexRequest(userMessage: string, config: RzeclawConfig): boolean;
/**
 * 调用模型获取步骤列表（仅文本，不调用工具）。返回格式化后的步骤文本，失败或空则返回空串。
 */
export declare function fetchPlanSteps(config: RzeclawConfig, userMessage: string): Promise<string>;
