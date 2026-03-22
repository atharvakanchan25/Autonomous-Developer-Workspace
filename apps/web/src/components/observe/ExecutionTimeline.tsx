import type { TimelineRow, AgentType, TaskStatus } from "@/types";

const AGENT_BAR_COLOURS: Record<AgentType, string> = {
  CODE_GENERATOR: "bg-indigo-400",
  TEST_GENERATOR: "bg-teal-400",
  CODE_REVIEWER:  "bg-orange-400",
};

const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  PENDING:     "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  COMPLETED:   "bg-green-500",
  FAILED:      "bg-red-500",
};

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ExecutionTimelineProps {
  rows: TimelineRow[];
  loading?: boolean;
}

export function ExecutionTimeline({ rows, loading }: ExecutionTimelineProps) {
  if (loading) return <p className="py-8 text-center text-sm text-gray-400">Loading…</p>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-gray-400">No executions yet</p>;

  const maxDuration = Math.max(...rows.map((r) => r.totalDurationMs), 1);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        {(["CODE_GENERATOR", "TEST_GENERATOR", "CODE_REVIEWER"] as AgentType[]).map((a) => (
          <span key={a} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${AGENT_BAR_COLOURS[a]}`} />
            {a.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {rows.map((row) => {
        const barWidth = (row.totalDurationMs / maxDuration) * 100;

        return (
          <div key={row.taskId} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TASK_STATUS_DOT[row.status]}`} />
                <span className="truncate text-sm font-medium text-gray-800">{row.title}</span>
                <span className="shrink-0 text-xs text-gray-400">{row.project.name}</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-600">
                {fmt(row.totalDurationMs)}
              </span>
            </div>

            {/* Stacked bar */}
            <div className="h-4 w-full overflow-hidden rounded bg-gray-100">
              <div className="flex h-full" style={{ width: `${barWidth}%` }}>
                {row.stages.map((stage) => {
                  const stageWidth = row.totalDurationMs > 0
                    ? ((stage.durationMs ?? 0) / row.totalDurationMs) * 100
                    : 0;
                  return (
                    <div
                      key={stage.id}
                      title={`${stage.agentType}: ${fmt(stage.durationMs ?? 0)}`}
                      className={`h-full ${AGENT_BAR_COLOURS[stage.agentType as AgentType] ?? "bg-gray-300"} ${
                        stage.status === "FAILED" ? "opacity-50" : ""
                      }`}
                      style={{ width: `${stageWidth}%` }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Stage durations */}
            <div className="mt-1.5 flex flex-wrap gap-3">
              {row.stages.map((stage) => (
                <span key={stage.id} className="text-[10px] text-gray-400">
                  {stage.agentType.replace(/_/g, " ")}: {fmt(stage.durationMs ?? 0)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
