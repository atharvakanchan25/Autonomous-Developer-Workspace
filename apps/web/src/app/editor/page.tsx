"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useFileTree } from "@/lib/useFileTree";
import { FileExplorer } from "@/components/editor/FileExplorer";
import { EditorPane } from "@/components/editor/EditorPane";
import { RenameModal } from "@/components/editor/RenameModal";
import type { Project, ProjectFile } from "@/types";

export default function EditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get("projectId") ?? "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectIdParam);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { tree, loading, refresh, addFile, updateFile, removeFile } =
    useFileTree(selectedProjectId || null);

  // Load projects for the selector
  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null);
  }, []);

  function handleProjectChange(id: string) {
    setSelectedProjectId(id);
    setActiveFile(null);
    const p = new URLSearchParams();
    if (id) p.set("projectId", id);
    router.replace(`/editor?${p.toString()}`);
  }

  // Create a new file
  const handleNewFile = useCallback(async (path: string, name: string) => {
    if (!selectedProjectId) return;
    try {
      const file = await api.files.create({ projectId: selectedProjectId, path, name });
      addFile(file);
      setActiveFile(file);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create file");
    }
  }, [selectedProjectId, addFile]);

  // Delete a file
  const handleDelete = useCallback(async (file: ProjectFile) => {
    if (!confirm(`Delete "${file.path}"?`)) return;
    setDeleteError(null);
    try {
      await api.files.delete(file.id);
      removeFile(file.id);
      if (activeFile?.id === file.id) setActiveFile(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [activeFile, removeFile]);

  // Rename a file
  const handleRenameConfirm = useCallback(async (path: string, name: string) => {
    if (!renameTarget) return;
    try {
      const updated = await api.files.rename(renameTarget.id, { path, name });
      updateFile(updated);
      if (activeFile?.id === updated.id) setActiveFile(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenameTarget(null);
    }
  }, [renameTarget, activeFile, updateFile]);

  // When a file is saved, sync the tree metadata
  const handleSaved = useCallback((file: ProjectFile) => {
    updateFile(file);
    setActiveFile(file);
  }, [updateFile]);

  // When a file is selected, fetch full content if not already loaded
  const handleSelect = useCallback(async (file: ProjectFile) => {
    if (file.content !== undefined && file.content !== null) {
      setActiveFile(file);
      return;
    }
    try {
      const full = await api.files.get(file.id);
      updateFile(full);
      setActiveFile(full);
    } catch {
      setActiveFile(file);
    }
  }, [updateFile]);

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col bg-gray-900">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 border-b border-gray-700/60 bg-gray-900 px-4 py-2">
        <select
          value={selectedProjectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {selectedProjectId && (
          <button
            onClick={refresh}
            className="rounded border border-gray-700 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-700/60 hover:text-gray-300"
          >
            ↺ Refresh
          </button>
        )}

        {deleteError && (
          <span className="text-xs text-red-400">{deleteError}</span>
        )}
      </div>

      {/* ── Main layout: sidebar + editor ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* File explorer sidebar */}
        <div className="w-56 shrink-0 border-r border-gray-700/60">
          {selectedProjectId ? (
            <FileExplorer
              tree={tree}
              selectedId={activeFile?.id ?? null}
              onSelect={handleSelect}
              onNewFile={handleNewFile}
              onDelete={handleDelete}
              onRename={setRenameTarget}
              loading={loading}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="px-4 text-center text-[12px] text-gray-600">
                Select a project to browse files
              </p>
            </div>
          )}
        </div>

        {/* Monaco editor pane */}
        <div className="flex-1 overflow-hidden">
          <EditorPane file={activeFile} onSaved={handleSaved} />
        </div>
      </div>

      {/* Rename modal */}
      {renameTarget && (
        <RenameModal
          file={renameTarget}
          onConfirm={handleRenameConfirm}
          onCancel={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
}
