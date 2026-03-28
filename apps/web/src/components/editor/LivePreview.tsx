"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { ProjectFile } from "@/types";

interface LivePreviewProps {
  file: ProjectFile | null;
  projectId: string | null;
  allFiles: ProjectFile[];
}

export function LivePreview({ file, projectId, allFiles }: LivePreviewProps) {
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewType, setPreviewType] = useState<"html" | "react" | "markdown" | "code" | "none">("none");
  const [error, setError] = useState<string | null>(null);
  const [showFullProject, setShowFullProject] = useState(false);

  // Build complete project HTML from all files
  const projectHTML = useMemo(() => {
    if (!projectId || allFiles.length === 0) return null;

    console.log('Building project preview from files:', allFiles.map(f => ({ name: f.name, hasContent: !!f.content })));

    // Find HTML entry point
    const htmlFile = allFiles.find(f => 
      f.name === "index.html" || 
      f.name === "main.html" || 
      f.name.endsWith(".html")
    );

    if (htmlFile?.content) {
      console.log('Found HTML file:', htmlFile.name);
      return htmlFile.content;
    }

    // Build from JS/JSX/TS/TSX files
    const jsFiles = allFiles.filter(f => 
      f.content && (
        f.name.endsWith(".js") || 
        f.name.endsWith(".jsx") ||
        f.name.endsWith(".ts") ||
        f.name.endsWith(".tsx")
      )
    );
    const cssFiles = allFiles.filter(f => f.content && f.name.endsWith(".css"));

    console.log('JS files:', jsFiles.length, 'CSS files:', cssFiles.length);

    if (jsFiles.length > 0) {
      const cssContent = cssFiles.map(f => f.content).join("\n");
      const jsContent = jsFiles.map(f => f.content).join("\n");
      
      // Check if it's React code
      const isReact = jsContent.includes("React") || jsContent.includes("jsx") || jsFiles.some(f => f.name.endsWith(".jsx") || f.name.endsWith(".tsx"));

      console.log('Is React project:', isReact);

      if (isReact) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Preview</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${jsContent}
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    if (typeof App !== 'undefined') {
      root.render(<App />);
    } else if (typeof default !== 'undefined') {
      root.render(React.createElement(default));
    } else {
      root.render(<div style={{padding: '20px', fontFamily: 'system-ui'}}>React loaded. Define an App component to render.</div>);
    }
  </script>
</body>
</html>`;
      }

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="app"></div>
  <script>
    // Enhanced console for output display
    (function() {
      const originalLog = console.log;
      console.log = function(...args) {
        originalLog.apply(console, args);
        const output = document.getElementById('console-output') || (() => {
          const div = document.createElement('div');
          div.id = 'console-output';
          div.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; max-height: 200px; overflow: auto; padding: 15px; background: #1f2937; color: #10b981; font-family: monospace; font-size: 12px; border-top: 2px solid #10b981; z-index: 9999;';
          document.body.appendChild(div);
          return div;
        })();
        const line = document.createElement('div');
        line.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
        line.style.marginBottom = '4px';
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
      };
    })();
    
    try {
      ${jsContent}
    } catch (error) {
      document.body.innerHTML = '<div style="padding: 20px; background: #fee; border: 2px solid #c00; border-radius: 8px; margin: 20px;"><strong>Error:</strong> ' + error.message + '</div>' + document.body.innerHTML;
    }
  </script>
</body>
</html>`;
    }

    console.log('No files to build preview from');
    return null;
  }, [projectId, allFiles]);

  useEffect(() => {
    setError(null);
    
    if (!file || !file.content) {
      setPreviewType("none");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    
    try {
      if (ext === "html" || ext === "htm") {
        setPreviewType("html");
        setPreviewContent(enhanceHTML(file.content));
      } else if (ext === "jsx" || ext === "tsx") {
        setPreviewType("react");
        setPreviewContent(buildReactPreview(file.content, allFiles));
      } else if (ext === "js" || ext === "ts") {
        setPreviewType("html");
        setPreviewContent(buildJSPreview(file.content, allFiles));
      } else if (ext === "css") {
        setPreviewType("html");
        setPreviewContent(buildCSSPreview(file.content));
      } else if (ext === "md" || ext === "markdown") {
        setPreviewType("markdown");
        const html = convertMarkdownToHTML(file.content);
        setPreviewContent(html);
      } else {
        setPreviewType("code");
        setPreviewContent(file.content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview error");
      setPreviewType("none");
    }
  }, [file, allFiles]);

  function enhanceHTML(html: string): string {
    if (!html.trim().toLowerCase().startsWith("<!doctype")) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
    }
    return html;
  }

  function buildReactPreview(jsxContent: string, files: ProjectFile[]): string {
    const cssFiles = files.filter(f => f.name.endsWith(".css"));
    const cssContent = cssFiles.map(f => f.content).join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Preview</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${jsxContent}
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    if (typeof App !== 'undefined') {
      root.render(<App />);
    }
  </script>
</body>
</html>`;
  }

  function buildJSPreview(jsContent: string, files: ProjectFile[]): string {
    const cssFiles = files.filter(f => f.name.endsWith(".css"));
    const cssContent = cssFiles.map(f => f.content).join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JavaScript Preview</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="root"></div>
  <script>
    console.log = function(...args) {
      const output = document.getElementById('console-output') || (() => {
        const div = document.createElement('div');
        div.id = 'console-output';
        div.style.cssText = 'margin-top: 20px; padding: 15px; background: #1f2937; color: #10b981; font-family: monospace; font-size: 12px; border-radius: 8px; white-space: pre-wrap;';
        document.body.appendChild(div);
        return div;
      })();
      output.innerHTML += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
    };
    
    ${jsContent}
  </script>
</body>
</html>`;
  }

  function buildCSSPreview(cssContent: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSS Preview</title>
  <style>
    ${cssContent}
  </style>
</head>
<body>
  <div style="padding: 20px;">
    <h1>CSS Preview</h1>
    <p>Sample paragraph to demonstrate styles.</p>
    <button>Sample Button</button>
    <div class="container">
      <div class="box">Box 1</div>
      <div class="box">Box 2</div>
    </div>
  </div>
</body>
</html>`;
  }

  function convertMarkdownToHTML(md: string): string {
    const html = md
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2 text-gray-100">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-5 mb-3 text-gray-100">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4 text-gray-100">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-100">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-gray-300">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-800 px-1.5 py-0.5 rounded text-sm text-indigo-300 font-mono">$1</code>')
      .replace(/\n\n/g, '</p><p class="mb-3 text-gray-300">')
      .replace(/\n/g, '<br/>');
    return `<div class="prose prose-invert max-w-none p-6"><p class="mb-3 text-gray-300">${html}</p></div>`;
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1E1E1E] text-gray-500">
        <div className="text-center">
          <div className="mb-2 text-4xl">📋</div>
          <p className="text-sm">Select a project to see preview</p>
        </div>
      </div>
    );
  }

  console.log('Preview state:', { projectHTML: !!projectHTML, showFullProject, hasFile: !!file, filesCount: allFiles.length });

  // Always show project preview if button is clicked or no file selected
  if (projectHTML && projectId && (showFullProject || !file)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full overflow-hidden bg-[#1E1E1E]"
      >
        <div className="flex h-12 items-center justify-between border-b border-white/10 bg-[#252526] px-4">
          <div>
            <h3 className="text-sm font-medium text-gray-300">🚀 Live Project Output</h3>
            <p className="text-xs text-gray-500">Running complete application</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFullProject(false)}
              className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600 transition-colors"
            >
              ← Back to File
            </button>
            <span className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
              Live
            </span>
          </div>
        </div>
        <iframe
          srcDoc={projectHTML}
          className="h-[calc(100%-3rem)] w-full bg-white"
          title="Project Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        />
      </motion.div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1E1E1E] text-gray-500">
        <div className="text-center">
          <div className="mb-2 text-4xl">👁️</div>
          <p className="text-sm">Select a file to preview</p>
          <p className="mt-1 text-xs text-gray-600">HTML, CSS, JS, React supported</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1E1E1E] text-gray-500">
        <div className="text-center">
          <div className="mb-2 text-4xl">⚠️</div>
          <p className="text-sm text-red-400">Preview Error</p>
          <p className="mt-1 text-xs text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (previewType === "none") {
    return (
      <div className="flex h-full items-center justify-center bg-[#1E1E1E] text-gray-500">
        <div className="text-center">
          <div className="mb-2 text-4xl">📄</div>
          <p className="text-sm">No preview available</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full overflow-hidden bg-[#1E1E1E]"
    >
      <div className="flex h-12 items-center justify-between border-b border-white/10 bg-[#252526] px-4">
        <div>
          <h3 className="text-sm font-medium text-gray-300">Live Preview</h3>
          <p className="text-xs text-gray-500">{file.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {projectHTML && (
            <button
              onClick={() => setShowFullProject(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-lg"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 1a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5h-6.5a.75.75 0 010-1.5h6.5v-6.5A.75.75 0 018 1z" />
              </svg>
              View Full Project
            </button>
          )}
          <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-400">
            {previewType === "html" || previewType === "react" ? "Live" : previewType.toUpperCase()}
          </span>
        </div>
      </div>

      {(previewType === "html" || previewType === "react") && (
        <iframe
          srcDoc={previewContent}
          className="h-[calc(100%-3rem)] w-full bg-white"
          title="Live Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
        />
      )}

      {previewType === "markdown" && (
        <div
          className="h-[calc(100%-3rem)] overflow-auto bg-[#1E1E1E]"
          dangerouslySetInnerHTML={{ __html: previewContent }}
        />
      )}

      {previewType === "code" && (
        <div className="h-[calc(100%-3rem)] overflow-auto bg-[#1E1E1E] p-4">
          <div className="rounded-lg border border-white/10 bg-[#252526] p-4">
            <pre className="overflow-auto text-xs text-gray-300">
              <code>{previewContent}</code>
            </pre>
          </div>
        </div>
      )}
    </motion.div>
  );
}
