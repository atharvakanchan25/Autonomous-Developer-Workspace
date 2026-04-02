"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

const LANG_COLORS: Record<string, string> = {
  python: "bg-blue-900/40 text-blue-300",
  javascript: "bg-yellow-900/40 text-yellow-300",
  typescript: "bg-blue-900/40 text-blue-300",
  go: "bg-cyan-900/40 text-cyan-300",
  rust: "bg-orange-900/40 text-orange-300",
  java: "bg-red-900/40 text-red-300",
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const color = pct === 100 ? "bg-green-500" : pct > 50 ? "bg-indigo-500" : "bg-gray-500";
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">{done}/{total} tasks</span>
        <span className={`text-[10px] font-medium ${pct === 100 ? "text-green-400" : "text-gray-500"}`}>{pct}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-gray-700">
        <div className={`h-1 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("created");

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "tasks">("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setProjects(await api.projects.list()); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load projects"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.projects.create({ name: name.trim(), description: desc.trim() || undefined });
      setName(""); setDesc(""); setShowForm(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally { setCreating(false); }
  }

  async function handleDelete(id: string, projectName: string) {
    if (!confirm(`Delete "${projectName}" and all its tasks? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.projects.delete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete project");
    } finally { setDeletingId(null); }
  }

  const filtered = useMemo(() => {
    let list = [...projects];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    if (sort === "newest") list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    else if (sort === "oldest") list.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    else if (sort === "tasks") list.sort((a, b) => (b._count?.tasks ?? 0) - (a._count?.tasks ?? 0));
    return list;
  }, [projects, search, sort]);

  return (
    <PageShell>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1a1f2e] px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-gray-100">Projects</h1>
          {!loading && (
            <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[11px] text-gray-400">
              {projects.length}
            </span>
          )}
        </div>
        <motion.button
          onClick={() => setShowForm((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${
            showForm ? "bg-gray-800 text-gray-300" : "bg-indigo-600 text-white"
          }`}
          whileTap={buttonTap}
          transition={{ duration: duration.fast }}
        >
          {showForm ? "Cancel" : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
              New Project
            </>
          )}
        </motion.button>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#0f1419] px-8 py-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Create form */}
          <AnimatePresence>
            {showForm && (
              <motion.form
                onSubmit={handleCreate}
                className="overflow-hidden rounded-xl border border-indigo-800/60 bg-[#1a1f2e] p-6 shadow-sm"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: duration.standard, ease: ease.enter }}
              >
                <h2 className="mb-5 text-sm font-semibold text-gray-100">New Project</h2>
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Project name"
                    className="w-full rounded-lg border border-gray-700 bg-[#0f1419] px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-900/50"
                  />
                </div>
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Description</label>
                  <textarea
                    rows={2}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full resize-none rounded-lg border border-gray-700 bg-[#0f1419] px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-900/50"
                  />
                </div>
                {createError && <p className="mb-3 text-xs text-red-400">{createError}</p>}
                <motion.button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  whileTap={buttonTap}
                  transition={{ duration: duration.fast }}
                >
                  {creating ? "Creating…" : "Create Project"}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="rounded-lg border border-red-900 bg-red-950/90 px-4 py-3 text-sm text-red-300"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: duration.fast }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search + sort */}
          {!loading && projects.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <svg viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full rounded-lg border border-gray-700 bg-[#1a1f2e] py-2 pl-9 pr-4 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="rounded-lg border border-gray-700 bg-[#1a1f2e] px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="tasks">Most Tasks</option>
              </select>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
              Loading projects…
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 py-20 text-center">
              <p className="text-sm text-gray-400">No projects yet.</p>
              <p className="mt-1 text-xs text-gray-600">
                <Link href="/home" className="text-indigo-400 hover:text-indigo-300">Go to Home</Link> to generate your first project with AI.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 py-16 text-center">
              <p className="text-sm text-gray-500">No projects match "{search}"</p>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {filtered.map((p) => {
                const taskCount = p._count?.tasks ?? 0;
                const langColor = LANG_COLORS[p.language?.toLowerCase() ?? ""] ?? "bg-gray-700 text-gray-400";

                return (
                  <motion.div
                    key={p.id}
                    variants={fadeUp}
                    whileHover={cardHover}
                    className={`group relative flex flex-col rounded-xl border bg-[#1a1f2e] p-5 shadow-sm ${
                      p.id === createdId ? "border-indigo-700 ring-1 ring-indigo-700" : "border-gray-700"
                    } ${deletingId === p.id ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {/* Card header */}
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-900/40">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-indigo-400">
                          <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.language && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${langColor}`}>
                            {p.language}
                          </span>
                        )}
                        {/* Delete button — visible on hover */}
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="rounded-md p-1 text-gray-600 opacity-0 transition-all hover:bg-red-900/30 hover:text-red-400 group-hover:opacity-100"
                          title="Delete project"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.712z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Name + description */}
                    <h3 className="mb-1 truncate text-sm font-semibold text-gray-100">{p.name}</h3>
                    {p.description ? (
                      <p className="line-clamp-2 text-xs leading-relaxed text-gray-400">{p.description}</p>
                    ) : (
                      <p className="text-xs text-gray-600">No description</p>
                    )}

                    {/* Progress bar */}
                    <ProgressBar done={0} total={taskCount} />

                    {/* Footer */}
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">{timeAgo(p.updatedAt)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => api.files.download(p.id)}
                          className="rounded-md border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-800/50"
                          title="Download files"
                        >
                          ↓
                        </button>
                        <Link
                          href={`/tasks?projectId=${p.id}`}
                          className="rounded-md border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-800/50"
                        >
                          Tasks
                        </Link>
                        <Link
                          href={`/graph?projectId=${p.id}`}
                          className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-700"
                        >
                          Graph →
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </main>
    </PageShell>
  );
}
