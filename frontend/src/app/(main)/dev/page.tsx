"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useFileTree } from "@/lib/useFileTree";
import { FileExplorer } from "@/components/editor/FileExplorer";
import { ProjectSelect } from "@/components/ProjectSelect";
import type { ProjectFile } from "@/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  changes?: string[];
  editedCode?: string;
  filePath?: string;
  applied?: boolean;
  loading?: boolean;
}

// ── Diff viewer (simple line-by-line) ─────────────────────────────────────────

function DiffPreview({ original, edited }: { original: string; edited: string }) {
  const origLines = original.split("\n");
  const editLines = edited.split("\n");
  const maxLen = Math.max(origLines.length, editLines.length);

  const diffs: { type: "same" | "removed" | "added"; line: string; idx: number }[] = [];
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const e = editLines[i];
    if (o === e) {
      diffs.push({ type: "same", line: e ?? "", idx: i });
    } else {
      if (o !== undefined) diffs.push({ type: "removed", line: o, idx: i });
      if (e !== undefined) diffs.push({ type: "added", line: e, idx: i });
    }
  }

  const changed = diffs.filter((d) => d.type !== "same");
  if (changed.length === 0) return <p className="text-xs text-gray-500 px-3 py-2">No changes detected.</p>;

  // Show only changed lines with 2 lines of context
  const changedIdxs = new Set(changed.map((d) => d.idx));
  const visible = new Set<number>();
  changedIdxs.forEach((i) => {
    for (let j = Math.max(0, i - 2); j <= Math.min(maxLen, i + 2); j++) visible.add(j);
  });

  let lastIdx = -1;
  return (
    <div className="overflow-x-auto font-mono text-[11px] leading-5">
      {diffs
        .filter((d) => visible.has(d.idx))
        .map((d, i) => {
          const showEllipsis = lastIdx !== -1 && d.idx > lastIdx + 1;
          lastIdx = d.idx;
          return (
            <div key={i}>
              {showEllipsis && (
                <div className="px-3 py-0.5 text-gray-600 bg-[#1a1f2e]">···</div>
              )}
              <div
                className={`flex px-3 py-px ${
                  d.type === "removed"
                    ? "bg-red-950/60 text-red-300"
                    : d.type === "added"
                    ? "bg-green-950/60 text-green-300"
                    : "text-gray-500"
                }`}
              >
                <span className="w-4 shrink-0 select-none opacity-60">
                  {d.type === "removed" ? "-" : d.type === "added" ? "+" : " "}
                </span>
                <span className="whitespace-pre">{d.line}</span>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Chat message bubble ───────────────────────────────────────────────────────

function ChatMessage({
  msg,
  originalContent,
  onAccept,
  onReject,
}: {
  msg: Message;
  originalContent: string;
  onAccept: (msg: Message) => void;
  onReject: (msg: Message) => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const hasEdit = msg.editedCode && msg.editedCode !== originalContent;

  if (msg.role === "user") {
    return (
      <div className="flex justify-end px-4 py-1">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1">
      <div className="rounded-2xl rounded-tl-sm border border-gray-700 bg-[#1a1f2e] overflow-hidden">
        {/* Loading state */}
        {msg.loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-indigo-400"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
            <span>Thinking…</span>
          </div>
        )}

        {/* Explanation */}
        {!msg.loading && msg.content && (
          <div className="px-4 py-3 text-sm text-gray-200 leading-relaxed">
            {msg.content}
          </div>
        )}

        {/* Changes list */}
        {!msg.loading && msg.changes && msg.changes.length > 0 && (
          <div className="border-t border-gray-700/60 px-4 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Changes</p>
            <ul className="space-y-1">
              {msg.changes.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Diff + actions */}
        {!msg.loading && hasEdit && !msg.applied && (
          <div className="border-t border-gray-700/60">
            <button
              onClick={() => setShowDiff((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2 text-xs text-gray-400 hover:bg-white/5 transition-colors"
            >
              <span className="font-medium">View diff</span>
              <svg
                viewBox="0 0 12 12"
                fill="currentColor"
                className={`h-3 w-3 transition-transform ${showDiff ? "rotate-180" : ""}`}
              >
                <path d="M6 8L1 3h10L6 8z" />
              </svg>
            </button>

            <AnimatePresence>
              {showDiff && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-gray-700/60 max-h-64 overflow-y-auto"
                >
                  <DiffPreview original={originalContent} edited={msg.editedCode!} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-2 border-t border-gray-700/60 px-4 py-2.5">
              <button
                onClick={() => onAccept(msg)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                  <path d="M10 3L5 8.5 2 5.5l-1 1L5 10.5l6-8.5-1-1z" />
                </svg>
                Accept
              </button>
              <button
                onClick={() => onReject(msg)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-gray-700 transition-colors"
              >
                <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                  <path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" />
                </svg>
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Applied badge */}
        {msg.applied && (
          <div className="border-t border-gray-700/60 px-4 py-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
              <path d="M10 3L5 8.5 2 5.5l-1 1L5 10.5l6-8.5-1-1z" />
            </svg>
            Applied to file
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick action chips ────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  "Explain this file",
  "Add error handling",
  "Add JSDoc comments",
  "Refactor for readability",
  "Find potential bugs",
  "Add TypeScript types",
  "Write unit tests",
  "Optimize performance",
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DevPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [projectId, setProjectId] = useState(searchParams.get("projectId") ?? "");
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectFile | null>(null);

  const editorRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { tree, loading, refresh, addFile, updateFile, removeFile } = useFileTree(projectId || null);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleProjectChange = useCallback((id: string) => {
    setProjectId(id);
    setActiveFile(null);
    setEditorContent("");
    setMessages([]);
    const p = new URLSearchParams();
    if (id) p.set("projectId", id);
    router.replace(`/dev?${p.toString()}`);
  }, [router]);

  const handleSelectFile = useCallback(async (file: ProjectFile) => {
    try {
      const full = file.content != null ? file : await api.files.get(file.id);
      updateFile(full);
      setActiveFile(full);
      setEditorContent(full.content ?? "");
      setMessages([]);
    } catch {
      setActiveFile(file);
      setEditorContent(file.content ?? "");
    }
  }, [updateFile]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setEditorContent(value ?? "");
  }, []);

  const handleNewFile = useCallback(async (path: string, name: string) => {
    if (!projectId) return;
    try {
      const file = await api.files.create({ projectId, path, name });
      addFile(file);
      setActiveFile(file);
      setEditorContent("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create file");
    }
  }, [projectId, addFile]);

  const handleDelete = useCallback(async (file: ProjectFile) => {
    if (!confirm(`Delete "${file.path}"?`)) return;
    try {
      await api.files.delete(file.id);
      removeFile(file.id);
      if (activeFile?.id === file.id) { setActiveFile(null); setEditorContent(""); }
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

  const sendMessage = useCallback(async (instruction: string) => {
    if (!instruction.trim() || !activeFile || sending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: instruction.trim(),
    };
    const loadingMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setSending(true);

    // Build history for context (exclude loading messages)
    const history = messages
      .filter((m) => !m.loading)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const result = await api.dev.chat({
        instruction: instruction.trim(),
        fileContent: editorContent,
        filePath: activeFile.path,
        language: activeFile.language,
        projectId,
        conversationHistory: history,
      });

      const assistantMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: result.explanation,
        changes: result.changes,
        editedCode: result.editedCode,
        filePath: activeFile.path,
        applied: false,
      };

      setMessages((prev) => prev.slice(0, -1).concat(assistantMsg));
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
      };
      setMessages((prev) => prev.slice(0, -1).concat(errMsg));
    } finally {
      setSending(false);
    }
  }, [activeFile, editorContent, messages, projectId, sending]);

  const handleAccept = useCallback(async (msg: Message) => {
    if (!msg.editedCode || !activeFile) return;

    // Update editor immediately
    setEditorContent(msg.editedCode);
    editorRef.current?.setValue(msg.editedCode);

    // Persist to backend
    try {
      const updated = await api.dev.apply(activeFile.id, msg.editedCode);
      updateFile(updated);
      setActiveFile(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
      return;
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, applied: true } : m))
    );
  }, [activeFile, updateFile]);

  const handleReject = useCallback((msg: Message) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, editedCode: undefined, changes: undefined } : m))
    );
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const originalContent = activeFile?.content ?? "";

  return (
    <div className="flex h-full overflow-hidden bg-[#0f1419]">

      {/* ── File Explorer ── */}
      <div className="w-52 shrink-0 border-r border-white/10 bg-[#252526] flex flex-col">
        <div className="flex h-10 shrink-0 items-center border-b border-white/10 bg-[#2D2D2D] px-3">
          <ProjectSelect
            value={projectId}
            onChange={handleProjectChange}
            className="border-white/10 bg-[#3C3C3C] text-gray-300 text-[11px] focus:border-indigo-500 w-full"
          />
        </div>
        {projectId ? (
          <FileExplorer
            tree={tree}
            selectedId={activeFile?.id ?? null}
            onSelect={handleSelectFile}
            onNewFile={handleNewFile}
            onDelete={handleDelete}
            onRename={setRenameTarget}
            loading={loading}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-center text-[11px] text-gray-600">Select a project</p>
          </div>
        )}
      </div>

      {/* ── Editor ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Editor topbar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-[#2D2D2D] px-4">
          <div className="flex items-center gap-2">
            {activeFile ? (
              <>
                <span className="text-[11px] text-gray-500">{activeFile.path}</span>
                <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                  {activeFile.language}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-gray-600">No file selected</span>
            )}
          </div>
          <button
            onClick={refresh}
            className="rounded border border-white/10 px-2 py-1 text-[11px] text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
          >
            ↺
          </button>
        </div>

        {/* Monaco */}
        <div className="flex-1 overflow-hidden">
          {activeFile ? (
            <MonacoEditor
              key={activeFile.id}
              height="100%"
              language={activeFile.language}
              value={editorContent}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                fontLigatures: true,
                minimap: { enabled: true, scale: 1 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
                padding: { top: 12, bottom: 12 },
                automaticLayout: true,
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-600">
              <svg className="h-12 w-12 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <p className="text-sm">Select a file to start editing</p>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Chat Panel ── */}
      <div className="flex w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#0f1419]">

        {/* Chat header */}
        <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-white/10 bg-[#1a1f2e] px-4">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600">
            <svg viewBox="0 0 16 16" fill="white" className="h-3 w-3">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.5L14 6v4.5L8 14 2 10.5V6L8 2.5z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-100">AI Dev Assistant</span>
          {activeFile && (
            <span className="ml-auto truncate max-w-[120px] text-[10px] text-gray-500">
              {activeFile.name}
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-3 space-y-1">
          {messages.length === 0 && (
            <div className="px-4 py-6 text-center">
              <div className="mb-3 flex justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-indigo-400">
                    <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <p className="text-sm font-medium text-gray-300">
                {activeFile ? `Editing ${activeFile.name}` : "Select a file to begin"}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {activeFile
                  ? "Ask me to modify, explain, refactor, or debug your code"
                  : "Open a file from the explorer on the left"}
              </p>

              {/* Quick actions */}
              {activeFile && (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      onClick={() => sendMessage(action)}
                      className="rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-[11px] text-gray-400 hover:border-indigo-500/50 hover:bg-indigo-900/20 hover:text-indigo-300 transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              originalContent={originalContent}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick actions (when chat has messages) */}
        {messages.length > 0 && activeFile && (
          <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 px-3 py-2 scrollbar-none">
            {QUICK_ACTIONS.slice(0, 4).map((action) => (
              <button
                key={action}
                onClick={() => sendMessage(action)}
                disabled={sending}
                className="shrink-0 rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-[10px] text-gray-500 hover:border-indigo-500/50 hover:text-indigo-300 transition-colors disabled:opacity-40"
              >
                {action}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-white/10 bg-[#1a1f2e] p-3">
          <div className={`flex items-end gap-2 rounded-xl border bg-[#0f1419] px-3 py-2 transition-colors ${
            activeFile ? "border-gray-700 focus-within:border-indigo-500/60" : "border-gray-800 opacity-50"
          }`}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!activeFile || sending}
              placeholder={activeFile ? "Ask me to edit, explain, or refactor… (Enter to send)" : "Select a file first"}
              className="flex-1 resize-none bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || !activeFile || sending}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8 1.5l6.5 6.5-6.5 6.5M14.5 8H1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-700">
            Shift+Enter for new line · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
