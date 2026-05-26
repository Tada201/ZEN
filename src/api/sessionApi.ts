import { callCommand } from "./tauriClient";
import type {
  GraphSessionState,
  SessionAction,
  SessionFeedback,
} from "@/types/session";

export const sessionApi = {
  createGraphSession: (name: string) =>
    callCommand<string>("create_graph_session", { name }),
  getSessionState: (sessionId: string) =>
    callCommand<GraphSessionState>("get_session_state", { sessionId }),
  applySessionAction: <T = SessionFeedback>(sessionId: string, action: SessionAction | { action: string }) =>
    callCommand<T>("apply_session_action", { sessionId, action }),
  rollbackSession: (sessionId: string, version: number) =>
    callCommand<SessionFeedback>("rollback_session", { sessionId, version }),
};
