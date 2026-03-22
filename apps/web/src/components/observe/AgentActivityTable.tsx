import type { AgentRunRow, AgentRunStatus } from "@/types";

const STATUS_STYLES: Record<AgentRunStatus, string> = {
  RUNNING:   "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  FAILED:    "bg-red-50 text-red-700",
};

const AGENT_COLOURS: Record<string, string> = {
  CODE_GENERATOR: "text-indigo-600",
  TEST_GENERATOR: "text-teal-600",
  CODE_REVIEWER:  "text-orange-600",
};

interface AgentActivityTableProps {
  runs: AgentRunRow[];
  loading?: boolean;
}

export function AgentActivityTable({ runs, loading }: AgentActivityTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No agent runs yet</td></tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className={`px-3 py-2 font-medium ${AGENT_COLOURS[run.agentType] ?? "text-gray-700"}`}>
                    {run.agentType.replace(/_/g, " ")}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-gray-700">
                    {run.task.title}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[run.status]}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                    {run.durationMs != null ? `${run.durationMs}ms` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-400">
                    {new Date(run.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-red-500">
                    {run.errorMsg ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
