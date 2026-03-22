"use client";

import { useState, useCallback, useRef } from "react";
import type { FileNode } from "@/lib/useFileTree";
import type { ProjectFile } from "@/types";

// ── Icons (inline SVG to avoid extra deps) ────────────────────────────────────

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-yellow-500" viewBox="0 0 16 16" fill="currentColor">
      {open ? (
        <path d="M1.5 3A1.5 1.5 0 000 4.5v8A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H7.621a1.5 1.5 0 01-1.06-.44L5.5 3H1.5z" />
      ) : (
        <path d="M.54 3.87L.5 3a2 2 0 012-2h3.672a2 2 0 011.414.586l.828.828A2 2 0 009.828 3h3.982a2 2 0 011.992 2.181l-.637 7A2 2 0 0113.174 14H2.826a2 2 0 01-1.991-1.819l-.637-7a1.99 1.99 0 01.342-1.31z" />
      )}
    </svg>
  );
}

function FileIcon({ language }: { language: string }) {
  const colors: Record<string, string> = {
    typescript: "text-blue-400", javascript: "text-yellow-400",
    python: "text-green-400", json: "text-orange-400",
    markdown: "text-gray-400", css: "text-pink-400",
    html: "text-red-400", rust: "text-orange-500",
    go: "text-cyan-400", sql: "text-purple-400",
  };
  const color = colors[language] ?? "text-gray-500";
  return (
    <svg className={`h-3.5 w-3.5 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4.414A2 2 0 0013.414 3L11 .586A2 2 0 009.586 0H4zm0 1.5h5.586L12 3.914V14a.5.5 0 01-.5.5h-7A.5.5 0 014 14V2a.5.5 0 01.5-.5H4z" />
    </svg>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedId: string | null;
  onSelect: (file: ProjectFile) => void;
  onDelete: (file: ProjectFile) => void;
  onRename: (file: ProjectFile) => void;
}

function TreeNode({ node, depth, selectedId, onSelect, onDelete, onRename }: TreeNodeProps) {
  const [open, setOpen] = useState(true);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const isSelected = node.type === "file" && node.file?.id === selectedId;

  const handleContext = useCallback((e: React.MouseEvent) => {
    if (node.type !== "file") return;
    e.preventDefault();
    setCtxPos({ x: e.clientX, y: e.clientY });
  }, [node.type]);

  const closeCtx = useCallback(() => setCtxPos(null), []);

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1.5 rounded px-2 py-[3px] text-[13px] transition-colors
          ${isSelected ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700/60"}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (node.type === "folder") setOpen((v) => !v);
          else if (node.file) onSelect(node.file);
        }}
        onContextMenu={handleContext}
      >
        {node.type === "folder" ? (
          <>
            <span className="text-gray-500 text-[10px]">{open ? "▾" : "▸"}</span>
            <FolderIcon open={open} />
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileIcon language={node.file?.language ?? "plaintext"} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>

      {/* Context menu */}
      {ctxPos && node.file && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtx} />
          <div
            className="fixed z-50 min-w-[140px] rounded-md border border-gray-700 bg-gray-800 py-1 shadow-xl text-[13px]"
            style={{ top: ctxPos.y, left: ctxPos.x }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-gray-300 hover:bg-gray-700"
              onClick={() => { onRename(node.file!); closeCtx(); }}
            >
              Rename
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-gray-700"
              onClick={() => { onDelete(node.file!); closeCtx(); }}
            >
              Delete
            </button>
          </div>
        </>
      )}

      {node.type === "folder" && open && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

// ── New file form ─────────────────────────────────────────────────────────────

interface NewFileFormProps {
  onSubmit: (path: string, name: string) => void;
  onCancel: () => void;
}

function NewFileForm({ onSubmit, onCancel }: NewFileFormProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="px-2 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        const parts = trimmed.split("/");
        const name = parts[parts.length - 1]!;
        onSubmit(trimmed, name);
      }}
    >
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="src/utils/helper.ts"
        className="w-full rounded border border-blue-500 bg-gray-800 px-2 py-1 text-[12px] text-gray-200 outline-none placeholder-gray-600"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <div className="mt-1 flex gap-1">
        <button type="submit" className="rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-500">
          Create
        </button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-300">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main FileExplorer ─────────────────────────────────────────────────────────

export interface FileExplorerProps {
  tree: FileNode[];
  selectedId: string | null;
  onSelect: (file: ProjectFile) => void;
  onNewFile: (path: string, name: string) => void;
  onDelete: (file: ProjectFile) => void;
  onRename: (file: ProjectFile) => void;
  loading: boolean;
}

export function FileExplorer({
  tree, selectedId, onSelect, onNewFile, onDelete, onRename, loading,
}: FileExplorerProps) {
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <div className="flex h-full flex-col bg-gray-900 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Explorer
        </span>
        <button
          title="New file"
          onClick={() => setShowNewForm(true)}
          className="rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
          </svg>
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="px-3 py-4 text-[12px] text-gray-600">Loading…</p>
        ) : tree.length === 0 && !showNewForm ? (
          <p className="px-3 py-4 text-[12px] text-gray-600">No files yet. Click + to create one.</p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))
        )}

        {showNewForm && (
          <NewFileForm
            onSubmit={(path, name) => { onNewFile(path, name); setShowNewForm(false); }}
            onCancel={() => setShowNewForm(false)}
          />
        )}
      </div>
    </div>
  );
}
