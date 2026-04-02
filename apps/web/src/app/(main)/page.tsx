"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import type { Project, Task, AgentRunRow } from "@/types";
import { PageShell } from "@/components/PageShell";
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TEMPLATES = [
  { label: "REST API + Auth", prompt: "Build a REST API with user authentication using JWT tokens, refresh tokens, and role-based access control" },
  { label: "CRUD App", prompt: "Build a full CRUD application with SQLite database, input validation, and error handling" },
  { label: "CLI Tool", prompt: "Build a command-line tool with argument parsing, config file support, and colored output" },
  { label: "Web Scraper", prompt: "Build a web scraper with rate limiting, retry logic, data parsing, and CSV export" },
  { label: "Chat API", prompt: "Build a real-time chat API with WebSocket support, message history, and user presence" },
  { label: "Data Pipeline", prompt: "Build a data pipeline that ingests CSV files, transforms data, validates schema, and stores results" },
];

const AGENT_LABELS: Record<string, string> = {
  CODE_GENERATOR: "Code",
  TEST_GENERATOR: "Tests",
  CODE_REVIEWER: "Review",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full rounded-full bg-gray-700">
        <div
          className="h-1.5 rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-gray-600">{done}/{total} tasks complete</p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.projects.list().then(setProjects).catch(() => {}),
      api.tasks.list().then(setRecentTasks).catch(() => {}),
      api.observe.agents(6).then(setAgentRuns).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const project = await api.projects.create({
        name: description.trim().slice(0, 100),
        description: description.trim(),
      });
      await api.ai.generatePlan({ projectId: project.id, description: description.trim() });
      router.push(`/graph?projectId=${project.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const firstName = user?.displayName?.split(" ")[0] ?? null;

  // Most recently updated project
  const latestProject = projects[0] ?? null;
  const latestProjectTasks = recentTasks.filter((t) => t.projectId === latestProject?.id);
  const completedTasks = latestProjectTasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <PageShell>
      <header className="flex h-14 shrink-0 items-center border-b border-gray-700 bg-[#1a1f2e] px-8">
        <h1 className="text-sm font-medium text-gray-100">Home</h1>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#0f1419]">
        <div className="mx-auto max-w-3xl px-8 py-8 space-y-8">

          {/* Greeting */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter }}
          >
            <h2 className="text-2xl font-semibold text-gray-100">
              {firstName ? `Hey, ${firstName} 👋` : "Welcome back 👋"}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Describe what you want to build — AI handles the rest.
            </p>
          </motion.div>

          {/* Prompt input */}
          <motion.form
            onSubmit={handleGenerate}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter, delay: 0.08 }}
          >
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Build a REST API for a task management app with user authentication, CRUD operations, and JWT tokens..."
              className="w-full resize-none rounded-lg border border-gray-700 bg-[#1a1f2e] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-900/50"
            />
            <AnimatePresence>
              {submitError && (
                <motion.p
                  className="mt-2 text-xs text-red-400"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: duration.fast }}
                >
                  {submitError}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {description.length > 0 ? `${description.length} characters` : "Be as specific as possible"}
              </p>
              <motion.button
                type="submit"
                disabled={submitting || !description.trim()}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ backgroundColor: "#4f46e5" }}
                whileTap={buttonTap}
                transition={{ duration: duration.fast }}
              >
                {submitting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Generating…
                  </>
                ) : (
                  "Generate Plan →"
                )}
              </motion.button>
            </div>
          </motion.form>

          {/* Prompt templates */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter, delay: 0.12 }}
          >
            <p className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Try a template</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setDescription(t.prompt)}
                  className="rounded-full border border-gray-700 bg-[#1a1f2e] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-indigo-600 hover:text-indigo-300"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Continue where you left off */}
          {!loading && latestProject && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.slow, ease: ease.enter, delay: 0.16 }}
            >
              <p className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Continue where you left off</p>
              <Link
                href={`/graph?projectId=${latestProject.id}`}
                className="block rounded-xl border border-gray-700 bg-[#1a1f2e] px-5 py-4 transition-colors hover:border-indigo-700 hover:bg-indigo-950/20"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-100">{latestProject.name}</p>
                    {latestProject.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{latestProject.description}</p>
                    )}
                    <ProgressBar done={completedTasks} total={latestProjectTasks.length} />
                  </div>
                  <div className="ml-4 flex shrink-0 flex-col items-end gap-1.5">
                    {latestProject.language && (
                      <span className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300">{latestProject.language}</span>
                    )}
                    <span className="text-[10px] text-gray-600">{timeAgo(latestProject.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Recent agent activity */}
          {!loading && agentRuns.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.slow, ease: ease.enter, delay: 0.24 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Agent Activity</p>
                <Link href="/observe" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
              </div>
              <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] divide-y divide-gray-700/60">
                {agentRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        run.status === "COMPLETED" ? "bg-green-400"
                        : run.status === "FAILED" ? "bg-red-400"
                        : "bg-amber-400 animate-pulse"
                      }`} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-200">{run.task.title}</p>
                        <p className="text-[10px] text-gray-500">{run.task.projectId.slice(0, 8)}…</p>
                      </div>
                    </div>
                    <div className="ml-4 flex shrink-0 items-center gap-3">
                      <span className="rounded bg-gray-700/80 px-2 py-0.5 text-[10px] text-gray-400">
                        {AGENT_LABELS[run.agentType] ?? run.agentType}
                      </span>
                      {run.durationMs && (
                        <span className="text-[10px] text-gray-600">{(run.durationMs / 1000).toFixed(1)}s</span>
                      )}
                      <span className="text-[10px] text-gray-600">{timeAgo(run.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Recent projects */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter, delay: 0.28 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Projects</p>
              <Link href="/projects" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
                Loading…
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-700 py-10 text-center">
                <p className="text-sm text-gray-500">No projects yet. Create one above.</p>
              </div>
            ) : (
              <motion.ul
                className="divide-y divide-gray-700/60 overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e]"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {projects.slice(0, 5).map((p) => (
                  <motion.li key={p.id} variants={fadeUp}>
                    <Link
                      href={`/graph?projectId=${p.id}`}
                      className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-gray-800/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-100">{p.name}</p>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{p.description}</p>
                        )}
                      </div>
                      <div className="ml-4 flex shrink-0 items-center gap-3">
                        {p.language && (
                          <span className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300">{p.language}</span>
                        )}
                        <span className="text-xs text-gray-500">{p._count?.tasks ?? 0} tasks</span>
                        <span className="text-xs text-gray-600">{timeAgo(p.updatedAt)}</span>
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-gray-600">
                          <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </motion.div>

          <div className="pb-8" />
        </div>
      </main>
    </PageShell>
  );
}
