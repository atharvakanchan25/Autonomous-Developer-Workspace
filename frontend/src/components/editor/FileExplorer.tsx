"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type { FileNode } from "@/lib/useFileTree";
import type { ProjectFile } from "@/types";

// ── Language colors & icons ───────────────────────────────────────────────────

const FILE_COLORS: Record<string, string> = {
  typescript: "text-blue-400", javascript: "text-yellow-400",
  python: "text-green-400", json: "text-yellow-300",
  markdown: "text-gray-400", css: "text-pink-400",
  html: "text-orange-400", rust: "text-orange-500",
  go: "text-cyan-400", sql: "text-purple-400",
  java: "text-red-400", plaintext: "text-gray-500",
};

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-3.5 w-3.5 shrink-0 text-[#dcb862]" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3A1.5 1.5 0 000 4.5v8A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H7.621a1.5 1.5 0 01-1.06-.44L5.5 3H1.5z" />
    </svg>
  ) : (
    <svg className="h-3.5 w-3.5 shrink-0 text-[#c09553]" viewBox="0 0 16 16" fill="currentColor">
      <path d="M.54 3.87L.5 3a2 2 0 012-2h3.672a2 2 0 011.414.586l.828.828A2 2 0 009.828 3h3.982a2 2 0 011.992 2.181l-.637 7A2 2 0 0113.174 14H2.826a2 2 0 01-1.991-1.819l-.637-7a1.99 1.99 0 01.342-1.31z" />
    </svg>
  );
}

function FileIcon({ language }: { language: string }) {
  const color = FILE_COLORS[language] ?? "text-gray-500";
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
  collapsedAll: boolean;
  onSelect: (file: ProjectFile) => void;
  onDelete: (file: ProjectFile) => void;
  onRename: (file: ProjectFile) => void;
}

function TreeNode({ node, depth, selectedId, collapsedAll, onSelect, onDelete, onRename }: TreeNodeProps) {
  const [open, setOpen] = useState(true);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const isSelected = node.type === "file" && node.file?.id === selectedId;

  // Sync with collapse-all
  const isOpen = collapsedAll ? false : open;

  const handleContext = useCallback((e: React.MouseEvent) => {
    if (node.type !== "file") return;
    e.preventDefault();
    setCtxPos({ x: e.clientX, y: e.clientY });
  }, [node.type]);

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1.5 py-[3px] pr-2 text-[13px] transition-colors select-none
          ${isSelected
            ? "bg-[#094771] text-white"
            : "text-[#cccccc] hover:bg-white/[0.06]"
          }`}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
        onClick={() => {
          if (node.type === "folder") setOpen((v) => !v);
          else if (node.file) onSelect(node.file);
        }}
        onContextMenu={handleContext}
      >
        {node.type === "folder" ? (
          <>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-gray-500">
              <path d={isOpen ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <FolderIcon open={isOpen} />
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileIcon language={node.file?.language ?? "plaintext"} />
          </>
        )}
        <span className="truncate flex-1">{node.name}</span>

        {/* Hover actions for files */}
        {node.type === "file" && node.file && (
          <div className="ml-auto hidden items-center gap-0.5 group-hover:flex">
            <button
              onClick={(e) => { e.stopPropagation(); onRename(node.file!); }}
              title="Rename"
              className="rounded p-0.5 text-gray-600 hover:bg-white/10 hover:text-gray-300"
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                <path d="M8.5 1.5a1.5 1.5 0 012.121 2.121L9.5 4.743 7.257 2.5 8.5 1.5zM6.5 3.257L1 8.757V11h2.243l5.5-5.5L6.5 3.257z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.file!); }}
              title="Delete"
              className="rounded p-0.5 text-gray-600 hover:bg-red-900/40 hover:text-red-400"
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                <path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxPos && node.file && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxPos(null)} />
          <div
            className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-white/10 bg-[#252526] py-1 shadow-2xl text-[13px]"
            style={{ top: ctxPos.y, left: ctxPos.x }}
          >
            <button
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#094771]"
              onClick={() => { onRename(node.file!); setCtxPos(null); }}
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="h-3.5 w-3.5 text-gray-500">
                <path d="M8.5 1.5a1.5 1.5 0 012.121 2.121L9.5 4.743 7.257 2.5 8.5 1.5zM6.5 3.257L1 8.757V11h2.243l5.5-5.5L6.5 3.257z" />
              </svg>
              Rename
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            <button
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-red-400 hover:bg-red-900/30"
              onClick={() => { onDelete(node.file!); setCtxPos(null); }}
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25z" />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}

      {node.type === "folder" && isOpen && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          collapsedAll={collapsedAll}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

// ── New file form ─────────────────────────────────────────────────────────────

function NewFileForm({ onSubmit, onCancel }: { onSubmit: (path: string, name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="px-2 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        const parts = trimmed.split("/");
        onSubmit(trimmed, parts[parts.length - 1]!);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="src/utils/helper.py"
        className="w-full rounded border border-blue-500/60 bg-[#3c3c3c] px-2 py-1 text-[12px] text-[#cccccc] outline-none placeholder-gray-600 focus:border-blue-400"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <div className="mt-1.5 flex gap-1">
        <button type="submit" className="rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-500">Create</button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-300">Cancel</button>
      </div>
    </form>
  );
}

// ── Main FileExplorer ─────────────────────────────────────────────────────────

export interface FileExplorerProps {
  tree: FileNode[];
  fileCount: number;
  selectedId: string | null;
  onSelect: (file: ProjectFile) => void;
  onNewFile: (path: string, name: string) => void;
  onDelete: (file: ProjectFile) => void;
  onRename: (file: ProjectFile) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function FileExplorer({
  tree, fileCount, selectedId, onSelect, onNewFile, onDelete, onRename, onRefresh, loading,
}: FileExplorerProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsedAll, setCollapsedAll] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Flatten tree for search
  const allFiles = useMemo(() => {
    const flat: ProjectFile[] = [];
    function walk(nodes: FileNode[]) {
      for (const n of nodes) {
        if (n.type === "file" && n.file) flat.push(n.file);
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return flat;
  }, [tree]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allFiles.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
  }, [search, allFiles]);

  return (
    <div className="flex h-full flex-col bg-[#252526] select-none">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Explorer
          {fileCount > 0 && <span className="ml-1.5 text-gray-600">({fileCount})</span>}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            title="Search files"
            onClick={() => { setShowSearch((v) => !v); setSearch(""); }}
            className={`rounded p-1 transition-colors ${showSearch ? "bg-white/10 text-gray-300" : "text-gray-600 hover:bg-white/10 hover:text-gray-300"}`}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 111.06-1.06l2.755 2.754a.75.75 0 11-1.06 1.06l-2.755-2.754zM10.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            title="Collapse all folders"
            onClick={() => setCollapsedAll((v) => !v)}
            className="rounded p-1 text-gray-600 hover:bg-white/10 hover:text-gray-300"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
            </svg>
          </button>
          <button
            title="New file"
            onClick={() => setShowNewForm(true)}
            className="rounded p-1 text-gray-600 hover:bg-white/10 hover:text-gray-300"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search input */}
      {showSearch && (
        <div className="border-b border-white/[0.06] px-2 py-1.5">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full rounded border border-white/10 bg-[#3c3c3c] px-2 py-1 text-[12px] text-[#cccccc] outline-none placeholder-gray-600 focus:border-blue-500/60"
          />
        </div>
      )}

      {/* Tree / search results */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4">
            <span className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-gray-400" />
            <span className="text-[12px] text-gray-600">Loading…</span>
          </div>
        ) : showSearch && search ? (
          searchResults.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-gray-600">No files match "{search}"</p>
          ) : (
            searchResults.map((file) => (
              <div
                key={file.id}
                onClick={() => onSelect(file)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${
                  file.id === selectedId ? "bg-[#094771] text-white" : "text-[#cccccc] hover:bg-white/[0.06]"
                }`}
              >
                <FileIcon language={file.language} />
                <span className="truncate flex-1">{file.name}</span>
                <span className="shrink-0 text-[10px] text-gray-600 truncate max-w-[80px]">
                  {file.path.split("/").slice(0, -1).join("/")}
                </span>
              </div>
            ))
          )
        ) : tree.length === 0 && !showNewForm ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[12px] text-gray-600">No files yet.</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="mt-2 text-[11px] text-blue-400 hover:text-blue-300"
            >
              Create a file
            </button>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedId={selectedId}
              collapsedAll={collapsedAll}
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
