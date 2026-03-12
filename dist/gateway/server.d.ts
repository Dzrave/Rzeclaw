import type { RzeclawConfig } from "../config.js";
/** Phase 10 WO-1002: sessionType 为 dev | knowledge | pm | swarm_manager | general */
/** WO-SEC-006: 隐私会话标记，为 true 时不写 L1、不持久化快照 */
/** WO-BT-022: 黑板槽位，BT/FSM 与 runAgentLoop 共享读写 */
/** WO-BT-023: 会话级 FSM 状态，chat 入口先迁移再路由 */
export type SessionFSMState = "Idle" | "Local_Intercept" | "Executing_Task" | "Deep_Reasoning";
export declare function createGatewayServer(config: RzeclawConfig, port: number): void;
