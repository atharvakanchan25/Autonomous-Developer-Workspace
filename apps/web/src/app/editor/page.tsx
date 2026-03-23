"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useFileTree } from "@/lib/useFileTree";
import { FileExplorer } from "@/components/editor/FileExplorer";
import { EditorPane } from "@/components/editor/EditorPane";
import { RenameModal } from "@/components/editor/RenameModal";
import { ProjectSelect } from "@/components/ProjectSelect";
import type { ProjectFile } from "@/types";

export default function EditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get("projectId") ?? "");
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { tree, loading, refresh, addFile, updateFile, removeFile } =
    useFileTree(selectedProjectId || null);

  function handleProjectChange(id: string) {
    setSelectedProjectId(id);
    setActiveFile(null);
    const p = new URLSearchParams();
    if (id) p.set("projectId", id);
    router.replace(`/editor?${p.toString()}`);
  }

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

  const handleSaved = useCallback((file: ProjectFile) => {
    updateFile(file);
    setActiveFile(file);
  }, [updateFile]);

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
    <div className="flex h-full flex-col bg-[#1E1E1E]">
      {/* Top bar */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-white/10 bg-[#2D2D2D] px-4">
        <ProjectSelect
          value={selectedProjectId}
          onChange={handleProjectChange}
          className="border-white/10 bg-[#3C3C3C] text-gray-300 text-xs focus:border-indigo-500"
        />
        {selectedProjectId && (
          <button
            onClick={refresh}
            className="rounded border border-white/10 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          >
            ↺
          </button>
        )}
        {activeFile && (
          <span className="ml-2 text-xs text-gray-500">
            {activeFile.path}
          </span>
        )}
        {deleteError && <span className="text-xs text-red-400">{deleteError}</span>}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* File explorer */}
        <div className="w-52 shrink-0 border-r border-white/10 bg-[#252526]">
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
            <div className="flex h-full items-center justify-center px-4">
              <p className="text-center text-[11px] text-gray-600">
                Select a project to browse files
              </p>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <EditorPane file={activeFile} onSaved={handleSaved} />
        </div>
      </div>

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
