"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Project } from "@/types";
import { PageShell } from "@/components/PageShell";
import { duration, ease, cardHover, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HomePage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null).finally(() => setLoading(false));
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

  return (
    <PageShell>
      <header className="flex h-14 shrink-0 items-center border-b border-gray-700 bg-[#1a1f2e] px-8">
        <h1 className="text-sm font-medium text-gray-100">Home</h1>
      </header>

      <main className="flex-1 px-8 py-10">
        <div className="mx-auto max-w-2xl">
          {/* Hero */}
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter }}
          >
            <h2 className="mb-2 text-2xl font-semibold text-gray-100">Start a new project</h2>
            <p className="text-sm text-gray-400">
              Describe what you want to build. The AI will generate a structured task plan and dependency graph.
            </p>
          </motion.div>

          {/* Form */}
          <motion.form
            onSubmit={handleGenerate}
            className="mb-12"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter, delay: 0.06 }}
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

          {/* Recent projects */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.enter, delay: 0.12 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">Recent projects</h3>
              <Link href="/projects" className="text-xs text-indigo-400 hover:text-indigo-300">
                View all
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
                Loading…
              </div>
            ) : projects.length === 0 ? (
              <motion.div
                className="rounded-lg border border-dashed border-gray-700 py-10 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: duration.standard }}
              >
                <p className="text-sm text-gray-500">No projects yet. Create one above.</p>
              </motion.div>
            ) : (
              <motion.ul
                className="divide-y divide-gray-700 overflow-hidden rounded-lg border border-gray-700 bg-[#1a1f2e] shadow-sm"
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
                      <div className="ml-4 flex shrink-0 items-center gap-4">
                        <span className="text-xs text-gray-500">
                          {p._count?.tasks ?? 0} task{p._count?.tasks !== 1 ? "s" : ""}
                        </span>
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
        </div>
      </main>
    </PageShell>
  );
}
