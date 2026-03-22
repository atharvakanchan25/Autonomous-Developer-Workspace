"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Project } from "@/types";
import { Spinner, ErrorMessage } from "@/components/Feedback";

export default function HomePage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects
      .list()
      .then(setProjects)
      .catch(() => null)
      .finally(() => setLoading(false));
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
      router.push(`/projects?created=${project.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-3xl font-semibold text-gray-900">
          Autonomous Developer Workspace
        </h1>
        <p className="text-gray-500">Describe a project and generate a structured plan.</p>
      </div>

      {/* Input form */}
      <form onSubmit={handleGenerate} className="mb-12">
        <label htmlFor="description" className="mb-2 block text-sm font-medium text-gray-700">
          Describe your project
        </label>
        <textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Build a REST API for a task management app with user authentication..."
          className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        {submitError && <ErrorMessage message={submitError} />}
        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating project…" : "Generate Plan"}
        </button>
      </form>

      {/* Recent projects */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Recent projects</h2>
          <Link href="/projects" className="text-xs text-gray-500 hover:text-gray-900">
            View all →
          </Link>
        </div>

        {loading ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <p className="text-sm text-gray-400">No projects yet. Create one above.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {projects.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/tasks?projectId=${p.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{p.description}</p>
                    )}
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-gray-400">
                    {p._count?.tasks ?? 0} task{p._count?.tasks !== 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
