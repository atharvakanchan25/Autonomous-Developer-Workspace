// All agent-related types live here so nothing needs to import from @prisma/client.

export enum AgentType {
  CODE_GENERATOR = "CODE_GENERATOR",
  TEST_GENERATOR = "TEST_GENERATOR",
  CODE_REVIEWER  = "CODE_REVIEWER",
}

export enum AgentRunStatus {
  RUNNING   = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED    = "FAILED",
}

export enum TaskStatus {
  PENDING     = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED   = "COMPLETED",
  FAILED      = "FAILED",
}

// what gets passed into every agent's run() method
export interface AgentContext {
  taskId: string;
  projectId: string;
  taskTitle: string;
  taskDescription: string;
  // outputs from agents that ran earlier in the same pipeline
  previousOutputs?: Partial<Record<AgentType, AgentResult>>;
}

// what every agent must return
export interface AgentResult {
  agentType: AgentType;
  summary: string;       // one-liner shown in the UI log feed
  artifacts: Artifact[]; // files produced (code, tests, review)
  rawLlmOutput: string;  // full LLM response stored for audit
  tokensUsed?: number;
}

export interface Artifact {
  type: "code" | "test" | "review" | "markdown";
  filename: string;
  content: string;
  language?: string;
}

// every agent class must implement this
export interface IAgent {
  readonly type: AgentType;
  readonly displayName: string;
  readonly description: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}

// what you pass to dispatchAgent()
export interface DispatchRequest {
  taskId: string;
  agentType: AgentType;
  pipeline?: boolean;
}

// what dispatchAgent() returns
export interface DispatchResult {
  agentRunId: string;
  taskId: string;
  agentType: AgentType;
  status: "COMPLETED" | "FAILED";
  result?: AgentResult;
  error?: string;
  durationMs: number;
}
