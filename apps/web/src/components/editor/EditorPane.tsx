"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { ProjectFile, FileVersionMeta, FileVersion } from "@/types";
import { api } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Tab bar ───────────────────────────────────────────────────────────────────

interface TabBarProps {
  tabs: OpenTab[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

interface OpenTab {
  id: string;
  name: string;
  dirty: boolean;
}

function TabBar({ tabs, activeId, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;
  return (
    <div className="flex overflow-x-auto border-b border-gray-700/60 bg-gray-900 scrollbar-none">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onActivate(tab.id)}
          className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-gray-700/40 px-3 py-2 text-[12px] transition-colors
            ${activeId === tab.id
              ? "bg-gray-800 text-gray-100 border-t-2 border-t-blue-500"
              : "text-gray-500 hover:bg-gray-800/50 hover:text-gray-300"
            }`}
        >
          <span className="max-w-[120px] truncate">{tab.name}</span>
          {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-400" title="Unsaved changes" />}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
            className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-600"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Version history panel ─────────────────────────────────────────────────────

interface VersionPanelProps {
  fileId: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

function VersionPanel({ fileId, onRestore, onClose }: VersionPanelProps) {
  const [versions, setVersions] = useState<FileVersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    api.files.listVersions(fileId)
      .then(setVersions)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [fileId]);

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      const v = await api.files.getVersion(fileId, versionId) as FileVersion;
      onRestore(v.content);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-gray-700/60 bg-gray-900 w-64 shrink-0">
      <div className="flex items-center justify-between border-b border-gray-700/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Version History
        </span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400">
          <svg className="h-4 w-4" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-4 text-[12px] text-gray-600">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-gray-600">No versions yet. Save with "Save Version" to create one.</p>
        ) : (
          versions.map((v) => (
            <div key={v.id} className="border-b border-gray-800 px-3 py-2.5">
              <p className="text-[12px] text-gray-300">
                {new Date(v.createdAt).toLocaleString()}
              </p>
              {v.label && <p className="mt-0.5 text-[11px] text-gray-500 truncate">{v.label}</p>}
              <p className="mt-0.5 text-[11px] text-gray-600">{(v.size / 1024).toFixed(1)} KB</p>
              <button
                onClick={() => handleRestore(v.id)}
                disabled={restoring === v.id}
                className="mt-1.5 rounded bg-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-600 disabled:opacity-50"
              >
                {restoring === v.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main EditorPane ───────────────────────────────────────────────────────────

export interface EditorPaneProps {
  file: ProjectFile | null;
  onSaved: (file: ProjectFile) => void;
}

export function EditorPane({ file, onSaved }: EditorPaneProps) {
  // Per-file content buffer (tracks unsaved edits)
  const contentMap = useRef<Map<string, string>>(new Map());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versionRestoreKey, setVersionRestoreKey] = useState(0);

  // When a new file is selected externally, open it as a tab
  useEffect(() => {
    if (!file) return;
    setTabs((prev) => {
      if (prev.find((t) => t.id === file.id)) return prev;
      return [...prev, { id: file.id, name: file.name, dirty: false }];
    });
    setActiveId(file.id);
    // Seed content buffer if not already there
    if (!contentMap.current.has(file.id)) {
      contentMap.current.set(file.id, file.content);
    }
    setSaveError(null);
  }, [file]);

  const activeFile = file?.id === activeId ? file : null;
  const activeContent = activeId ? (contentMap.current.get(activeId) ?? "") : "";

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeId) return;
    const newVal = value ?? "";
    contentMap.current.set(activeId, newVal);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeId
          ? { ...t, dirty: newVal !== (file?.content ?? "") }
          : t,
      ),
    );
  }, [activeId, file]);

  const handleSave = useCallback(async (createVersion = false) => {
    if (!activeId || !activeFile) return;
    const content = contentMap.current.get(activeId) ?? "";
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.files.update(activeId, { content, createVersion });
      contentMap.current.set(activeId, updated.content);
      setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, dirty: false } : t)));
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [activeId, activeFile, onSaved]);

  // Ctrl/Cmd+S to save — use the monaco instance passed to onMount, not window.monaco
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => handleSave(false),
    );
  }, [handleSave]);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        setActiveId(next[next.length - 1]?.id ?? null);
      }
      return next;
    });
    contentMap.current.delete(id);
  }, [activeId]);

  const handleVersionRestore = useCallback((content: string) => {
    if (!activeId) return;
    contentMap.current.set(activeId, content);
    setVersionRestoreKey((k) => k + 1); // force Monaco remount with new value
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, dirty: true } : t)),
    );
    setShowVersions(false);
  }, [activeId]);

  if (tabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-900 text-gray-600">
        <svg className="mb-3 h-10 w-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="text-[13px]">Select a file to start editing</p>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={handleCloseTab}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-700/60 bg-gray-900 px-3 py-1.5">
        <span className="text-[12px] text-gray-500">
          {activeFile?.path ?? ""}
        </span>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-[11px] text-red-400">{saveError}</span>
          )}
          <button
            onClick={() => setShowVersions((v) => !v)}
            className={`rounded px-2 py-1 text-[11px] transition-colors ${
              showVersions
                ? "bg-gray-700 text-gray-200"
                : "text-gray-500 hover:bg-gray-700/60 hover:text-gray-300"
            }`}
          >
            History
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !activeTab?.dirty}
            className="rounded px-2 py-1 text-[11px] text-gray-400 hover:bg-gray-700/60 hover:text-gray-300 disabled:opacity-40"
          >
            Save Version
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !activeTab?.dirty}
            className="rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Editor + version panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeFile && (
            <MonacoEditor
              key={`${activeId}-${versionRestoreKey}`}
              height="100%"
              language={activeFile.language}
              value={activeContent}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                fontLigatures: true,
                minimap: { enabled: true, scale: 1 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                insertSpaces: true,
                renderWhitespace: "selection",
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
                padding: { top: 12, bottom: 12 },
                lineNumbers: "on",
                glyphMargin: false,
                folding: true,
                automaticLayout: true,
              }}
            />
          )}
        </div>

        {showVersions && activeId && (
          <VersionPanel
            fileId={activeId}
            onRestore={handleVersionRestore}
            onClose={() => setShowVersions(false)}
          />
        )}
      </div>
    </div>
  );
}
