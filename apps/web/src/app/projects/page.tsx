"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Project } from "@/types";
import { Spinner, EmptyState, ErrorMessage } from "@/components/Feedback";

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("created");

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.projects.create({ name: name.trim(), description: desc.trim() || undefined });
      setName("");
      setDesc("");
      setShowForm(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {showForm ? "Cancel" : "+ New project"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5"
        >
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          {createError && <ErrorMessage message={createError} />}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </form>
      )}

      {error && <ErrorMessage message={error} />}

      {loading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState message="No projects yet. Create one to get started." />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {projects.map((p) => (
            <li
              key={p.id}
              className={`px-5 py-4 transition-colors hover:bg-gray-50 ${
                p.id === createdId ? "bg-green-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{p.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {p._count?.tasks ?? 0} task{p._count?.tasks !== 1 ? "s" : ""}
                  </span>
                  <Link
                    href={`/tasks?projectId=${p.id}`}
                    className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    View tasks →
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
