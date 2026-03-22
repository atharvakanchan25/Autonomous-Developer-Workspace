import { AgentType } from "@prisma/client";

export { AgentType };

// ── Input passed to every agent ───────────────────────────────────────────────
export interface AgentContext {
  taskId: string;
  projectId: string;
  taskTitle: string;
  taskDescription: string;
  // Optional artefacts produced by upstream agents in the same pipeline
  previousOutputs?: Partial<Record<AgentType, AgentResult>>;
}

// ── Output every agent must return ───────────────────────────────────────────
export interface AgentResult {
  agentType: AgentType;
  summary: string;       // one-line human-readable summary
  artifacts: Artifact[]; // zero or more produced artefacts
  rawLlmOutput: string;  // full LLM response, stored for audit
  tokensUsed?: number;
}

export interface Artifact {
  type: "code" | "test" | "review" | "markdown";
  filename: string;
  content: string;
  language?: string;
}

// ── Contract every agent must implement ──────────────────────────────────────
export interface IAgent {
  readonly type: AgentType;
  readonly displayName: string;
  readonly description: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}

// ── Dispatcher request / response ────────────────────────────────────────────
export interface DispatchRequest {
  taskId: string;
  agentType: AgentType;
  // If true, run CODE_GENERATOR → TEST_GENERATOR → CODE_REVIEWER in sequence
  pipeline?: boolean;
}

export interface DispatchResult {
  agentRunId: string;
  taskId: string;
  agentType: AgentType;
  status: "COMPLETED" | "FAILED";
  result?: AgentResult;
  error?: string;
  durationMs: number;
}
