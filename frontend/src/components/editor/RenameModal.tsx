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

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    const parts = trimmed.split("/");
    const name = parts[parts.length - 1]!;
    onConfirm(trimmed, name);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-gray-700 bg-gray-800 p-5 shadow-2xl">
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Rename / Move File</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
