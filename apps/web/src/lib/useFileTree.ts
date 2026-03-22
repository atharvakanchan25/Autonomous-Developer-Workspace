"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "./api";
import type { ProjectFile } from "@/types";

export interface FileNode {
  type: "file" | "folder";
  name: string;
  path: string;
  file?: ProjectFile;
  children?: FileNode[];
}

function buildTree(files: ProjectFile[]): FileNode[] {
  const root: FileNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let nodes = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i]!;
      const folderPath = parts.slice(0, i + 1).join("/");
      let folder = nodes.find((n) => n.type === "folder" && n.name === folderName);
      if (!folder) {
        folder = { type: "folder", name: folderName, path: folderPath, children: [] };
        nodes.push(folder);
      }
      nodes = folder.children!;
    }

    nodes.push({ type: "file", name: file.name, path: file.path, file });
  }

  // Sort: folders first, then files, both alphabetically
  function sort(nodes: FileNode[]): FileNode[] {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));
  }

  return sort(root);
}

export interface UseFileTreeResult {
  files: ProjectFile[];
  tree: FileNode[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addFile: (file: ProjectFile) => void;
  updateFile: (file: ProjectFile) => void;
  removeFile: (id: string) => void;
}

export function useFileTree(projectId: string | null): UseFileTreeResult {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) { setFiles([]); return; }
    setLoading(true);
    setError(null);
    try {
      setFiles(await api.files.list(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addFile = useCallback((file: ProjectFile) => {
    setFiles((prev) => [...prev, file]);
  }, []);

  const updateFile = useCallback((file: ProjectFile) => {
    setFiles((prev) => prev.map((f) => (f.id === file.id ? file : f)));
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return {
    files,
    tree: buildTree(files),
    loading,
    error,
    refresh,
    addFile,
    updateFile,
    removeFile,
  };
}
