"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useFileTree } from "@/lib/useFileTree";
import { FileExplorer } from "@/components/editor/FileExplorer";
import { EditorPane } from "@/components/editor/EditorPane";
import { RenameModal } from "@/components/editor/RenameModal";
import { ProjectSelect } from "@/components/ProjectSelect";
import { auth } from "@/lib/firebase";
import { webConfig } from "@/lib/config";
import type { ProjectFile } from "@/types";

const LANG_ICONS: Record<string, string> = {
  python: "🐍", javascript: "JS", typescript: "TS", go: "Go",
  rust: "Rs", java: "☕", markdown: "MD", json: "{}", css: "CSS",
  html: "HTML", sql: "SQL",
};

export default function EditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get("projectId") ?? "");
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectFile | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { tree, files, loading, refresh, addFile, updateFile, removeFile } =
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
    try {
      await api.files.delete(file.id);
      removeFile(file.id);
      if (activeFile?.id === file.id) setActiveFile(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
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

  const handleDownload = useCallback(async () => {
    if (!selectedProjectId) return;
    setDownloading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${webConfig.apiUrl}/api/files/download/${selectedProjectId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const match = (res.headers.get("content-disposition") ?? "").match(/filename=([^;]+)/);
      a.download = match ? match[1].trim() : "project.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [selectedProjectId]);

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

  // Breadcrumb parts from active file path
  const breadcrumbs = activeFile?.path.split("/") ?? [];
  const langIcon = activeFile ? (LANG_ICONS[activeFile.language] ?? activeFile.language) : null;

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#2d2d2d] px-3">

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar (⌘B)"
          className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-white/10 hover:text-gray-300"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11zM5.5 2.5H2.5v11h3V2.5zm1.5 0v11h6v-11H7z" />
          </svg>
        </button>

        <div className="mx-1 h-4 w-px bg-white/10" />

        {/* Project selector */}
        <ProjectSelect
          value={selectedProjectId}
          onChange={handleProjectChange}
          className="h-7 border-white/10 bg-[#3c3c3c] text-xs text-gray-300 focus:border-blue-500"
          placeholder="Open project…"
        />

        {/* Breadcrumb */}
        {activeFile && (
          <div className="flex items-center gap-1 overflow-hidden">
            <div className="mx-1 h-4 w-px bg-white/10" />
            {breadcrumbs.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-600">›</span>}
                <span className={`truncate text-xs ${i === breadcrumbs.length - 1 ? "text-gray-200" : "text-gray-500"}`}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Actions */}
        {selectedProjectId && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={refresh}
              title="Refresh files"
              className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-gray-500 hover:bg-white/10 hover:text-gray-300"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z" clipRule="evenodd" />
                <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z" />
              </svg>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              title="Download project as ZIP"
              className="flex h-7 items-center gap-1.5 rounded border border-white/10 px-2.5 text-xs text-gray-400 hover:bg-white/10 hover:text-gray-200 disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 12a.75.75 0 01-.75-.75V5.56L5.03 7.78a.75.75 0 01-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 01-1.06 1.06L8.75 5.56v5.69A.75.75 0 018 12z" transform="rotate(180 8 8)" />
                <path d="M1.5 14.25a.75.75 0 000 1.5h13a.75.75 0 000-1.5h-13z" />
              </svg>
              {downloading ? "Downloading…" : "Download ZIP"}
            </button>
          </div>
        )}
      </div>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* File explorer */}
        {sidebarOpen && (
          <div className="flex w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#252526]">
            {selectedProjectId ? (
              <FileExplorer
                tree={tree}
                fileCount={files.length}
                selectedId={activeFile?.id ?? null}
                onSelect={handleSelect}
                onNewFile={handleNewFile}
                onDelete={handleDelete}
                onRename={setRenameTarget}
                onRefresh={refresh}
                loading={loading}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-10 w-10 text-gray-700">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <p className="text-[11px] text-gray-600">Select a project<br />to browse files</p>
              </div>
            )}
          </div>
        )}

        {/* Editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorPane file={activeFile} onSaved={handleSaved} />
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.06] bg-[#007acc] px-3">
        <div className="flex items-center gap-3">
          {/* Branch-like indicator */}
          <span className="flex items-center gap-1 text-[11px] text-white/80">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.75 2.75 0 0110 8.75H6a1.25 1.25 0 00-1.25 1.25v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.75 2.75 0 016 7.25h4A1.25 1.25 0 0011.25 6V5.372A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" clipRule="evenodd" />
            </svg>
            main
          </span>
          {selectedProjectId && (
            <span className="text-[11px] text-white/60">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeFile && (
            <>
              {langIcon && (
                <span className="text-[11px] font-medium text-white/80">{langIcon}</span>
              )}
              <span className="text-[11px] text-white/60">
                {(activeFile.size / 1024).toFixed(1)} KB
              </span>
              <span className="text-[11px] text-white/60">UTF-8</span>
            </>
          )}
          <span className="text-[11px] text-white/60">ADW Editor</span>
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
