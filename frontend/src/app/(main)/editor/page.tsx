"use client";

import { useState, useCallback, useEffect } from "react";
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

function generatePreviewHTML(tree: ProjectFile[]): string {
  // Find HTML, CSS, and JS files
  const htmlFile = tree.find(f => f.path.endsWith(".html") || f.path.endsWith(".htm"));
  const cssFiles = tree.filter(f => f.path.endsWith(".css"));
  const jsFiles = tree.filter(f => f.path.endsWith(".js"));
  const pyFiles = tree.filter(f => f.path.endsWith(".py"));
  
  // If there's an HTML file, use it as base
  if (htmlFile?.content) {
    let html = htmlFile.content;
    
    // Inject CSS
    const cssContent = cssFiles.map(f => f.content || "").join("\n");
    if (cssContent && !html.includes("<style>")) {
      if (html.includes("</head>")) {
        html = html.replace("</head>", `<style>${cssContent}</style></head>`);
      } else {
        html = `<style>${cssContent}</style>` + html;
      }
    }
    
    // Inject JS
    const jsContent = jsFiles.map(f => f.content || "").join("\n");
    if (jsContent && !html.includes("<script>")) {
      if (html.includes("</body>")) {
        html = html.replace("</body>", `<script>${jsContent}</script></body>`);
      } else {
        html = html + `<script>${jsContent}</script>`;
      }
    }
    
    return html;
  }
  
  // If there are Python files, show a message
  if (pyFiles.length > 0 && jsFiles.length === 0) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview Not Available</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      max-width: 500px;
    }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { font-size: 14px; opacity: 0.9; line-height: 1.6; }
    .files {
      margin-top: 20px;
      padding: 20px;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      text-align: left;
    }
    .file { font-size: 12px; margin: 4px 0; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐍 Python Backend Project</h1>
    <p>This project contains Python backend code. Live preview is only available for frontend projects with HTML, CSS, or JavaScript files.</p>
    <div class="files">
      <strong>Project Files:</strong>
      ${tree.map(f => `<div class="file">📄 ${f.path}</div>`).join('')}
    </div>
    <p style="margin-top: 20px; font-size: 12px; opacity: 0.7;">To preview this project, run it locally using Python.</p>
  </div>
</body>
</html>
    `.trim();
  }
  
  // Generate a simple HTML page with available CSS and JS
  const cssContent = cssFiles.map(f => f.content || "").join("\n");
  const jsContent = jsFiles.map(f => f.content || "").join("\n");
  
  // If no files at all
  if (tree.length === 0) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Files</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #888;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    h1 { font-size: 18px; color: #666; }
  </style>
</head>
<body>
  <div>
    <h1>No files in this project yet</h1>
    <p>Create HTML, CSS, or JavaScript files to see a live preview</p>
  </div>
</body>
</html>
    `.trim();
  }
  
  // Create a basic preview page
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="app"></div>
  <script>
    try {
      ${jsContent}
    } catch (error) {
      document.body.innerHTML = '<div style="padding: 40px; text-align: center; color: #e74c3c;"><h2>JavaScript Error</h2><p>' + error.message + '</p></div>';
    }
  </script>
</body>
</html>
  `.trim();
}

export default function EditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get("projectId") ?? "");
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const { files, tree, loading, refresh, addFile, updateFile, removeFile } =
    useFileTree(selectedProjectId || null);

  // Auto-show preview if project has frontend files
  useEffect(() => {
    if (tree.length > 0) {
      const hasFrontendFiles = tree.some(f => 
        f.path.endsWith('.html') || 
        f.path.endsWith('.htm') || 
        f.path.endsWith('.css') || 
        f.path.endsWith('.js')
      );
      if (hasFrontendFiles && !showPreview) {
        setShowPreview(true);
      }
    }
  }, [tree, showPreview]);

  useEffect(() => {
    if (!showPreview) return;

    const filesMissingContent = tree.filter(
      (file) =>
        file.type === "file" &&
        file.file &&
        !file.file.content &&
        (file.path.endsWith(".html") ||
          file.path.endsWith(".htm") ||
          file.path.endsWith(".css") ||
          file.path.endsWith(".js"))
    );

    if (filesMissingContent.length === 0) return;

    let cancelled = false;

    (async () => {
      await Promise.all(
        filesMissingContent.map(async (node) => {
          try {
            const full = await api.files.get(node.file!.id);
            if (!cancelled) updateFile(full);
          } catch {
            return null;
          }
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [showPreview, tree, updateFile]);

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
    // Refresh preview when file is saved
    if (showPreview) {
      setPreviewKey(prev => prev + 1);
    }
  }, [updateFile, showPreview]);

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
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename=([^;]+)/);
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
    if (file.content) {
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
          <>
            <button
              onClick={refresh}
              className="rounded border border-white/10 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
            >
              ↺
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded border border-indigo-500/50 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/20 hover:text-indigo-300 disabled:opacity-50"
              title="Download project as ZIP"
            >
              {downloading ? "Downloading…" : "⬇ Download Project"}
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`rounded border px-3 py-1 text-xs transition-colors ${
                showPreview
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-white/10 text-gray-500 hover:bg-white/5 hover:text-gray-300"
              }`}
              title="Toggle live preview"
            >
              {showPreview ? "✓ Live Preview" : "▶ Live Preview"}
            </button>
          </>
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

        {/* Editor and Preview */}
        <div className="flex flex-1 overflow-hidden">
          {activeFile ? (
            <>
              <div className={showPreview ? "w-1/2" : "flex-1"}>
                <EditorPane file={activeFile} onSaved={handleSaved} />
              </div>
              {showPreview && (
                <div className="w-1/2 border-l border-white/10">
                  <iframe
                    key={previewKey}
                    srcDoc={generatePreviewHTML(files)}
                    className="h-full w-full bg-white"
                    sandbox="allow-scripts"
                    title="Live Preview"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-600">
                {selectedProjectId
                  ? "Select a file to edit"
                  : "Select a project to get started"}
              </p>
            </div>
          )}
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
