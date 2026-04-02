"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

export default function ProjectsPage() {
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

  return (
    <PageShell>
      <header className="app-topbar flex h-20 shrink-0 items-center justify-between px-8">
        <h1 className="app-title text-2xl font-semibold text-gray-100">Projects</h1>
        <motion.button
          onClick={() => setShowForm((v) => !v)}
          className={`flex items-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold ${
            showForm ? "app-button-secondary" : "app-button-primary"
          }`}
          whileTap={buttonTap}
          transition={{ duration: duration.fast }}
        >
          {showForm ? "Cancel" : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
              New project
            </>
          )}
        </motion.button>
      </header>

      <main className="flex-1 px-8 py-8">
        {/* Animated form reveal */}
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

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            className="app-empty rounded-[28px] py-16 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: duration.standard }}
          >
            <p className="text-sm text-gray-500">No projects yet.</p>
            <p className="mt-1 text-xs text-gray-600">Create one to get started.</p>
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {projects.map((p) => (
              <motion.div
                key={p.id}
                variants={fadeUp}
                whileHover={cardHover}
                className={`app-panel relative rounded-[28px] p-5 ${
                  p.id === createdId ? "border-[rgba(45,212,191,0.45)] ring-1 ring-[rgba(45,212,191,0.32)]" : ""
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgba(45,212,191,0.16)] bg-[rgba(45,212,191,0.1)]">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-[var(--accent)]">
                      <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  </div>
                  <span className="app-chip rounded-full px-2 py-0.5 text-[11px] font-medium">
                    {p._count?.tasks ?? 0} task{p._count?.tasks !== 1 ? "s" : ""}
                  </span>
                </div>
                <h3 className="mb-1 truncate text-sm font-semibold text-gray-100">{p.name}</h3>
                {p.description ? (
                  <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-gray-400">{p.description}</p>
                ) : (
                  <p className="mb-4 text-xs text-gray-600">No description</p>
                )}
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
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </PageShell>
  );
}
