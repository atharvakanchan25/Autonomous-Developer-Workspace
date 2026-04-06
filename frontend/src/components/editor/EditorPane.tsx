"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { OnMount, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type { ProjectFile, FileVersionMeta, FileVersion } from "@/types";
import { api } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenTab { id: string; name: string; language: string; dirty: boolean; }

// ── Tab bar ───────────────────────────────────────────────────────────────────

const LANG_DOT: Record<string, string> = {
  typescript: "bg-blue-400", javascript: "bg-yellow-400",
  python: "bg-green-400", json: "bg-yellow-300",
  markdown: "bg-gray-400", css: "bg-pink-400",
  html: "bg-orange-400", rust: "bg-orange-500",
  go: "bg-cyan-400", sql: "bg-purple-400",
};

function TabBar({ tabs, activeId, onActivate, onClose }: {
  tabs: OpenTab[]; activeId: string | null;
  onActivate: (id: string) => void; onClose: (id: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="flex overflow-x-auto border-b border-white/[0.06] bg-[#252526] scrollbar-none">
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => onActivate(tab.id)}
            className={`group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-white/[0.06] px-3 py-2 text-[12px] transition-colors
              ${active ? "bg-[#1e1e1e] text-[#cccccc]" : "bg-[#2d2d2d] text-[#8c8c8c] hover:bg-[#1e1e1e]/60 hover:text-[#cccccc]"}`}
          >
            {/* Active tab top border */}
            {active && <span className="absolute inset-x-0 top-0 h-[1px] bg-blue-500" />}

            {/* Language dot */}
            <span className={`h-2 w-2 shrink-0 rounded-full ${LANG_DOT[tab.language] ?? "bg-gray-500"}`} />

            <span className="max-w-[120px] truncate">{tab.name}</span>

            {/* Dirty indicator / close */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10"
            >
              {tab.dirty
                ? <span className="h-2 w-2 rounded-full bg-white/60" />
                : <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" /></svg>
              }
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Version history panel ─────────────────────────────────────────────────────

function VersionPanel({ fileId, onRestore, onClose }: {
  fileId: string; onRestore: (content: string) => void; onClose: () => void;
}) {
  const [versions, setVersions] = useState<FileVersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    api.files.listVersions(fileId).then(setVersions).catch(() => null).finally(() => setLoading(false));
  }, [fileId]);

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      const v = await api.files.getVersion(fileId, versionId) as FileVersion;
      onRestore(v.content);
    } finally { setRestoring(null); }
  }

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-l border-white/[0.06] bg-[#252526]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Timeline</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-4 text-[12px] text-gray-600">Loading…</p>
        ) : versions.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[12px] text-gray-600">No saved versions.</p>
            <p className="mt-1 text-[11px] text-gray-700">Use "Save Version" to snapshot this file.</p>
          </div>
        ) : (
          versions.map((v, i) => (
            <div key={v.id} className="border-b border-white/[0.04] px-3 py-2.5 hover:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-300">
                    {i === 0 ? "Latest" : `v${versions.length - i}`}
                  </p>
                  {v.label && <p className="mt-0.5 truncate text-[11px] text-gray-500">{v.label}</p>}
                  <p className="mt-0.5 text-[10px] text-gray-600">
                    {new Date(v.createdAt).toLocaleString()} · {(v.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={restoring === v.id}
                  className="shrink-0 rounded bg-[#3c3c3c] px-2 py-0.5 text-[10px] text-gray-300 hover:bg-[#4c4c4c] disabled:opacity-50"
                >
                  {restoring === v.id ? "…" : "Restore"}
                </button>
              </div>
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
  const contentMap = useRef<Map<string, string>>(new Map());
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versionRestoreKey, setVersionRestoreKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  // Open file as tab
  useEffect(() => {
    if (!file) return;
    setTabs((prev) => {
      if (prev.find((t) => t.id === file.id)) return prev;
      return [...prev, { id: file.id, name: file.name, language: file.language, dirty: false }];
    });
    setActiveId(file.id);
    if (!contentMap.current.has(file.id)) {
      contentMap.current.set(file.id, file.content ?? "");
    }
    setSaveError(null);
  }, [file]);

  const activeFile = file?.id === activeId ? file : null;
  const activeContent = activeId ? (contentMap.current.get(activeId) ?? "") : "";
  const activeTab = tabs.find((t) => t.id === activeId);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeId) return;
    const newVal = value ?? "";
    contentMap.current.set(activeId, newVal);
    setTabs((prev) =>
      prev.map((t) => t.id === activeId ? { ...t, dirty: newVal !== (file?.content ?? "") } : t)
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
      setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, dirty: false } : t));
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [activeId, activeFile, onSaved]);

  const handleEditorMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSave(false));
    editorInstance.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, col: e.position.column });
    });
  }, [handleSave]);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.id ?? null);
      return next;
    });
    contentMap.current.delete(id);
  }, [activeId]);

  const handleVersionRestore = useCallback((content: string) => {
    if (!activeId) return;
    contentMap.current.set(activeId, content);
    setVersionRestoreKey((k) => k + 1);
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, dirty: true } : t));
    setShowVersions(false);
  }, [activeId]);

  async function handleCopy() {
    const content = activeId ? contentMap.current.get(activeId) ?? "" : "";
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Empty state
  if (tabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1e1e1e]">
        <svg className="mb-4 h-16 w-16 opacity-[0.06]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="text-[13px] text-[#6c6c6c]">Select a file to start editing</p>
        <div className="mt-6 flex flex-col items-center gap-1.5">
          {[["⌘S", "Save"], ["⌘Z", "Undo"], ["⌘⇧P", "Command Palette"]].map(([key, label]) => (
            <div key={key} className="flex items-center gap-3 text-[11px] text-[#4c4c4c]">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono">{key}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">

      {/* Tab bar */}
      <TabBar tabs={tabs} activeId={activeId} onActivate={setActiveId} onClose={handleCloseTab} />

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1e1e1e] px-3 py-1">
        <span className="text-[11px] text-[#6c6c6c]">{activeFile?.path ?? ""}</span>
        <div className="flex items-center gap-1">
          {saveError && <span className="mr-2 text-[11px] text-red-400">{saveError}</span>}

          <button
            onClick={handleCopy}
            title="Copy file content"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[#8c8c8c] hover:bg-white/[0.06] hover:text-[#cccccc]"
          >
            {copied ? (
              <><svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3 text-green-400"><path d="M10 3L5 8.5 2 5.5l-1 1L5 10.5l6-8.5-1-1z" /></svg><span className="text-green-400">Copied</span></>
            ) : (
              <><svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" /><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" /></svg>Copy</>
            )}
          </button>

          <div className="mx-1 h-3.5 w-px bg-white/10" />

          <button
            onClick={() => setShowVersions((v) => !v)}
            className={`rounded px-2 py-1 text-[11px] transition-colors ${
              showVersions ? "bg-white/10 text-[#cccccc]" : "text-[#8c8c8c] hover:bg-white/[0.06] hover:text-[#cccccc]"
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !activeTab?.dirty}
            className="rounded px-2 py-1 text-[11px] text-[#8c8c8c] hover:bg-white/[0.06] hover:text-[#cccccc] disabled:opacity-30"
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
                minimap: { enabled: true, scale: 1, renderCharacters: false },
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
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: "gutter",
                occurrencesHighlight: "off",
                selectionHighlight: true,
                suggest: { showIcons: true },
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

      {/* Status bar — line/col + language */}
      {activeFile && (
        <div className="flex h-5 shrink-0 items-center justify-end gap-4 border-t border-white/[0.06] bg-[#007acc] px-3">
          <span className="text-[11px] text-white/70">
            Ln {cursor.line}, Col {cursor.col}
          </span>
          <span className="text-[11px] text-white/70">Spaces: 2</span>
          <span className="text-[11px] text-white/70">UTF-8</span>
          <span className="text-[11px] font-medium text-white/90 capitalize">{activeFile.language}</span>
        </div>
      )}
    </div>
  );
}
