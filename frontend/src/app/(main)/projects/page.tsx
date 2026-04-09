"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Project, Task } from "@/types";
import { PageShell } from "@/components/PageShell";
import { invalidateProjectSelectCache } from "@/components/ProjectSelect";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { duration, ease, cardHover, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

// ── helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const LANG_COLORS: Record<string, string> = {
  python: "bg-blue-900/40 text-blue-300 border-blue-700/40",
  javascript: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  typescript: "bg-blue-900/40 text-blue-200 border-blue-600/40",
  go: "bg-cyan-900/40 text-cyan-300 border-cyan-700/40",
  rust: "bg-orange-900/40 text-orange-300 border-orange-700/40",
  java: "bg-red-900/40 text-red-300 border-red-700/40",
  ruby: "bg-pink-900/40 text-pink-300 border-pink-700/40",
};

function langClass(lang?: string | null) {
  if (!lang) return "bg-white/5 text-gray-400 border-white/10";
  return LANG_COLORS[lang.toLowerCase()] ?? "bg-white/5 text-gray-400 border-white/10";
}

type SortKey = "newest" | "oldest" | "most-tasks" | "name";

// ── task progress cache ────────────────────────────────────────────────────────

function useTaskCounts(projects: Project[]) {
  const [counts, setCounts] = useState<Record<string, { done: number; total: number }>>({});

  useEffect(() => {
    if (projects.length === 0) return;
    projects.forEach(async (p) => {
      if (counts[p.id]) return;
      try {
        const tasks: Task[] = await api.tasks.list(p.id);
        setCounts((prev) => ({
          ...prev,
          [p.id]: {
            total: tasks.length,
            done: tasks.filter((t) => t.status === "COMPLETED").length,
          },
        }));
      } catch {
        setCounts((prev) => ({ ...prev, [p.id]: { total: p._count?.tasks ?? 0, done: 0 } }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  return counts;
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("created");

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // search + sort
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  // delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const taskCounts = useTaskCounts(projects);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await api.projects.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.projects.create({ name: name.trim(), description: desc.trim() || undefined });
      invalidateProjectSelectCache();
      setName(""); setDesc(""); setShowForm(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(p: Project) {
    if (!confirm(`Delete "${p.name}" and all its tasks? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await api.projects.delete(p.id);
      invalidateProjectSelectCache();
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    let list = [...projects];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "oldest":
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "most-tasks":
        list.sort((a, b) => (b._count?.tasks ?? 0) - (a._count?.tasks ?? 0));
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default: // newest
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [projects, query, sort]);

  return (
    <PageShell>
      {/* Header */}
      <header className="app-topbar flex h-20 shrink-0 items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <h1 className="app-title text-2xl font-semibold text-gray-100">Projects</h1>
          {!loading && (
            <span className="app-chip rounded-full px-2.5 py-0.5 text-xs font-medium">
              {projects.length}
            </span>
          )}
        </div>
        <motion.button
          onClick={() => setShowForm((v) => !v)}
          className={`flex items-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold ${
            showForm ? "app-button-secondary" : "app-button-primary"
          }`}
          whileTap={buttonTap}
          transition={{ duration: duration.fast }}
        >
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
              New project
            </>
          )}
        </motion.button>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Create form */}
        <AnimatePresence>
          {showForm && (
            <motion.form
              onSubmit={handleCreate}
              className="app-panel mb-8 overflow-hidden rounded-[28px] p-6"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 32 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: duration.standard, ease: ease.enter }}
            >
              <h2 className="app-title mb-5 text-xl font-semibold text-gray-100">New project</h2>
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  className="app-input w-full rounded-2xl px-3.5 py-3 text-sm"
                />
              </div>
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Description</label>
                <textarea
                  rows={2}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Optional description"
                  className="app-input w-full resize-none rounded-2xl px-3.5 py-3 text-sm"
                />
              </div>
              {createError && <p className="mb-3 text-xs text-red-400">{createError}</p>}
              <motion.button
                type="submit"
                disabled={creating || !name.trim()}
                className="app-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
                whileTap={buttonTap}
                transition={{ duration: duration.fast }}
              >
                {creating ? "Creating…" : "Create project"}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="mb-6 rounded-lg border border-red-900 bg-red-950/90 px-4 py-3 text-sm text-red-300"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: duration.fast }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search + Sort */}
        {!loading && projects.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              >
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                className="app-input w-full rounded-2xl py-2.5 pl-9 pr-4 text-sm"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="app-input rounded-2xl px-3.5 py-2.5 text-sm"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="most-tasks">Most tasks</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        )}

        {/* States */}
        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            className="app-empty rounded-[28px] py-20 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: duration.standard }}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-[var(--text-muted)]">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-400">No projects yet</p>
            <p className="mt-1 text-xs text-gray-600">
              Describe what you want to build and let AI do the rest.
            </p>
            <Link
              href="/home"
              className="app-button-primary mt-5 inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-semibold"
            >
              Generate with AI →
            </Link>
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No projects match <span className="text-gray-300">"{query}"</span>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {filtered.map((p) => {
              const tc = taskCounts[p.id];
              const total = tc?.total ?? p._count?.tasks ?? 0;
              const done = tc?.done ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const isDeleting = deletingId === p.id;

              return (
                <SpotlightCard
                  key={p.id}
                  variants={fadeUp}
                  whileHover={cardHover}
                  className={`app-panel group relative flex h-full flex-col overflow-hidden rounded-[28px] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover ${
                    p.id === createdId
                      ? "border-[rgba(255,255,255,0.45)] ring-1 ring-[rgba(255,255,255,0.32)]"
                      : ""
                  } ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {/* Top row: icon + badges + delete */}
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgba(45,212,191,0.16)] bg-[rgba(45,212,191,0.1)]">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-[var(--accent)]">
                          <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      {p.language && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${langClass(p.language)}`}
                        >
                          {p.language}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="app-chip rounded-full px-2 py-0.5 text-[11px] font-medium">
                        {total} task{total !== 1 ? "s" : ""}
                      </span>
                      {/* Delete — visible on hover */}
                      <button
                        onClick={() => handleDelete(p)}
                        className="flex h-7 w-7 items-center justify-center rounded-xl text-gray-600 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                        title="Delete project"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path
                            fillRule="evenodd"
                            d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5A.75.75 0 019.95 6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Name + description */}
                  <h3 className="mb-1 truncate text-sm font-semibold text-gray-100">{p.name}</h3>
                  {p.description ? (
                    <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-gray-400">
                      {p.description}
                    </p>
                  ) : (
                    <p className="mb-3 text-xs text-gray-600">No description</p>
                  )}

                  {/* Progress bar */}
                  {total > 0 && (
                    <div className="mb-4">
                      <div className="mb-1 flex justify-between text-[10px] text-[var(--text-muted)]">
                        <span>{done}/{total} done</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct === 100
                              ? "bg-green-400"
                              : pct > 0
                              ? "bg-indigo-400"
                              : "bg-white/20"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">{timeAgo(p.updatedAt)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => api.files.download(p.id)}
                        className="app-button-secondary rounded-xl px-2.5 py-1.5 text-[11px] font-medium"
                        title="Download project"
                      >
                        ⬇
                      </button>
                      <Link
                        href={`/tasks?projectId=${p.id}`}
                        className="app-button-secondary rounded-xl px-2.5 py-1.5 text-[11px] font-medium"
                      >
                        Tasks
                      </Link>
                      <Link
                        href={`/graph?projectId=${p.id}`}
                        className="app-button-primary rounded-xl px-2.5 py-1.5 text-[11px] font-semibold"
                      >
                        Graph →
                      </Link>
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </motion.div>
        )}
      </main>
    </PageShell>
  );
}
