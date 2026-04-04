"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Project } from "@/types";
import { PageShell } from "@/components/PageShell";
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const EXAMPLES = [
  "REST API for a blog with auth, posts, comments & likes",
  "CLI tool that converts Markdown to styled HTML",
  "WebSocket chat server with rooms and message history",
  "Data pipeline that fetches, transforms, and stores CSV files",
];

const FEATURES = [
  { icon: "⚡", label: "AI Task Planner" },
  { icon: "🤖", label: "3-Agent Pipeline" },
  { icon: "🧪", label: "Auto Test Gen" },
  { icon: "🚀", label: "CI/CD Built-in" },
];

export default function HomePage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [exampleIdx, setExampleIdx] = useState(0);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
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
      {/* ── Ambient orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #2dd4bf 0%, transparent 70%)", filter: "blur(72px)" }}
        />
        <div
          className="absolute top-1/3 -right-32 h-[380px] w-[380px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)", filter: "blur(80px)" }}
        />
        <div
          className="absolute bottom-0 -left-24 h-[320px] w-[320px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)", filter: "blur(80px)" }}
        />
      </div>

      <main className="relative flex flex-col items-center px-6 pt-20 pb-16">

        {/* ── Badge ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.enter }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-1.5 text-xs font-medium text-[var(--accent)]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          Autonomous Developer Workspace
        </motion.div>

        {/* ── Hero headline ── */}
        <motion.div
          className="mb-6 text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.enter, delay: 0.05 }}
        >
          <h1
            className="app-title text-5xl font-semibold leading-[1.12] tracking-tight text-gray-50 sm:text-6xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            Describe it.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #2dd4bf 0%, #6366f1 60%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Ship it.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[var(--text-secondary)]">
            Tell the AI what you want to build. It plans, codes, tests, reviews, and deploys — automatically.
          </p>
        </motion.div>

        {/* ── Feature pills ── */}
        <motion.div
          className="mb-10 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.slow, delay: 0.12 }}
        >
          {FEATURES.map((f) => (
            <span
              key={f.label}
              className="app-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
            >
              {f.icon} {f.label}
            </span>
          ))}
        </motion.div>

        {/* ── Prompt form ── */}
        <motion.form
          onSubmit={handleGenerate}
          className="w-full max-w-2xl"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.enter, delay: 0.16 }}
        >
          <div
            className="relative rounded-[28px] p-[1px]"
            style={{
              background: "linear-gradient(135deg, rgba(45,212,191,0.5) 0%, rgba(99,102,241,0.3) 50%, rgba(245,158,11,0.3) 100%)",
            }}
          >
            <div className="rounded-[27px] bg-[#07111a] p-4">
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder=""
                className="w-full resize-none bg-transparent text-sm leading-7 text-gray-100 outline-none placeholder:text-[var(--text-muted)]"
              />
              {/* Animated placeholder */}
              {!description && (
                <div className="pointer-events-none absolute left-8 top-8 text-sm text-[var(--text-muted)]">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={exampleIdx}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: duration.standard }}
                    >
                      e.g. {EXAMPLES[exampleIdx]}
                    </motion.span>
                  </AnimatePresence>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-[var(--text-muted)]">
                  {description.length > 0 ? `${description.length} chars` : "Be as specific as possible"}
                </p>
                <motion.button
                  type="submit"
                  disabled={submitting || !description.trim()}
                  className="app-button-primary flex items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  whileTap={buttonTap}
                  transition={{ duration: duration.fast }}
                >
                  {submitting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Generating…
                    </>
                  ) : (
                    <>
                      Generate Plan
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z" clipRule="evenodd" />
                      </svg>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {submitError && (
              <motion.p
                className="mt-3 text-center text-xs text-red-400"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: duration.fast }}
              >
                {submitError}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.form>

        {/* ── How it works strip ── */}
        <motion.div
          className="mt-16 w-full max-w-2xl"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.enter, delay: 0.22 }}
        >
          <div className="grid grid-cols-4 gap-3">
            {[
              { step: "01", title: "Describe", desc: "Plain English" },
              { step: "02", title: "Plan", desc: "AI task graph" },
              { step: "03", title: "Build", desc: "Code + tests" },
              { step: "04", title: "Deploy", desc: "CI/CD pipeline" },
            ].map((s, i) => (
              <div
                key={s.step}
                className="app-panel-soft relative rounded-2xl p-4 text-center"
              >
                {i < 3 && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 text-[var(--text-muted)] text-xs">›</div>
                )}
                <p className="text-[10px] font-mono text-[var(--accent)] mb-1">{s.step}</p>
                <p className="text-xs font-semibold text-gray-200">{s.title}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Recent projects ── */}
        <motion.div
          className="mt-14 w-full max-w-2xl"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.enter, delay: 0.28 }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Recent projects</h2>
            <Link href="/projects" className="text-xs text-[var(--accent)] hover:text-white transition-colors">
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
              Loading…
            </div>
          ) : projects.length === 0 ? (
            <motion.div
              className="app-empty rounded-[20px] py-12 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-2xl mb-2">🛠️</p>
              <p className="text-sm text-gray-500">No projects yet — describe something above to get started.</p>
            </motion.div>
          ) : (
            <motion.ul
              className="app-panel divide-y divide-white/[0.06] overflow-hidden rounded-[20px]"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {projects.slice(0, 5).map((p) => (
                <motion.li key={p.id} variants={fadeUp}>
                  <Link
                    href={`/graph?projectId=${p.id}`}
                    className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-indigo-500/20 flex items-center justify-center text-sm">
                        🗂️
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-100">{p.name}</p>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{p.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex shrink-0 items-center gap-4">
                      <span className="hidden sm:block text-xs text-gray-500">
                        {p._count?.tasks ?? 0} task{p._count?.tasks !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{timeAgo(p.updatedAt)}</span>
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">
                        <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </motion.div>
      </main>
    </PageShell>
  );
}
