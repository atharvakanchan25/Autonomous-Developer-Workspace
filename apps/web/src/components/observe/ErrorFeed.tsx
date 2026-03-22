import type { ObsLog } from "@/types";

interface ErrorFeedProps {
  errors: ObsLog[];
  loading?: boolean;
}

export function ErrorFeed({ errors, loading }: ErrorFeedProps) {
  if (loading) return <p className="py-6 text-center text-sm text-gray-400">Loading…</p>;
  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <span className="text-2xl">✓</span>
        <p className="text-sm text-gray-400">No errors recorded</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {errors.map((err) => (
        <li key={err.id} className="px-1 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-red-700">{err.message}</p>
              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-400">
                <span>{err.source}</span>
                {err.agentType && <span className="text-purple-500">{err.agentType}</span>}
                {err.durationMs != null && <span>{err.durationMs}ms</span>}
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
              {new Date(err.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
