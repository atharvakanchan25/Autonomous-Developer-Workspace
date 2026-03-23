import type { TimelineRow, AgentType, TaskStatus } from "@/types";

const AGENT_BAR: Record<AgentType, string> = {
  CODE_GENERATOR: "bg-indigo-400",
  TEST_GENERATOR: "bg-teal-400",
  CODE_REVIEWER:  "bg-orange-400",
};

const TASK_DOT: Record<TaskStatus, string> = {
  PENDING:     "bg-gray-500",
  IN_PROGRESS: "bg-indigo-500",
  COMPLETED:   "bg-green-500",
  FAILED:      "bg-red-500",
};

function fmt(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionTimeline({ rows, loading }: { rows: TimelineRow[]; loading?: boolean }) {
  if (loading) return <p className="py-10 text-center text-sm text-gray-500">Loading…</p>;
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-gray-500">No executions yet</p>;

  const maxDuration = Math.max(...rows.map((r) => r.totalDurationMs), 1);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        {(["CODE_GENERATOR", "TEST_GENERATOR", "CODE_REVIEWER"] as AgentType[]).map((a) => (
          <span key={a} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${AGENT_BAR[a]}`} />
            {a.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {rows.map((row) => {
        const barWidth = (row.totalDurationMs / maxDuration) * 100;
        return (
          <div key={row.taskId} className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TASK_DOT[row.status]}`} />
                <span className="truncate text-sm font-medium text-gray-200">{row.title}</span>
                <span className="shrink-0 text-xs text-gray-500">{row.project.name}</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-400">{fmt(row.totalDurationMs)}</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
              <div className="flex h-full" style={{ width: `${barWidth}%` }}>
                {row.stages.map((stage) => {
                  const w = row.totalDurationMs > 0
                    ? ((stage.durationMs ?? 0) / row.totalDurationMs) * 100
                    : 0;
                  return (
                    <div
                      key={stage.id}
                      title={`${stage.agentType}: ${fmt(stage.durationMs ?? 0)}`}
                      className={`h-full ${AGENT_BAR[stage.agentType as AgentType] ?? "bg-gray-600"} ${stage.status === "FAILED" ? "opacity-40" : ""}`}
                      style={{ width: `${w}%` }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-3">
              {row.stages.map((stage) => (
                <span key={stage.id} className="text-[10px] text-gray-500">
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
