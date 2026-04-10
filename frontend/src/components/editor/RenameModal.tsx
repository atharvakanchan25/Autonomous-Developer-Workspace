"use client";

import { useState, useEffect, useRef } from "react";
import type { ProjectFile } from "@/types";

interface RenameModalProps {
  file: ProjectFile;
  onConfirm: (path: string, name: string) => void;
  onCancel: () => void;
}

export function RenameModal({ file, onConfirm, onCancel }: RenameModalProps) {
  const [value, setValue] = useState(file.path);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    const parts = trimmed.split("/");
    onConfirm(trimmed, parts[parts.length - 1]!);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#252526] shadow-2xl">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className="text-[13px] font-medium text-[#cccccc]">Rename / Move File</h3>
          <p className="mt-0.5 text-[11px] text-[#6c6c6c]">Enter a new path. Use / to move between folders.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border border-white/10 bg-[#3c3c3c] px-3 py-2 text-[13px] text-[#cccccc] outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-[12px] text-[#8c8c8c] hover:bg-white/[0.06] hover:text-[#cccccc]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-blue-500"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
