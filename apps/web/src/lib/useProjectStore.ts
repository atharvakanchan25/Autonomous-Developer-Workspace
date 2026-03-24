"use client";

import { useState, useEffect, useCallback } from "react";

const KEY = "adw:selectedProjectId";

function read(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}

function write(id: string) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}

// In-memory subscribers so all hooks on the same page stay in sync
const listeners = new Set<(id: string) => void>();

export function useProjectStore() {
  const [projectId, setProjectIdState] = useState<string>(() => read());

  useEffect(() => {
    // Sync on mount in case another tab changed it
    setProjectIdState(read());

    const handler = (id: string) => setProjectIdState(id);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const setProjectId = useCallback((id: string) => {
    write(id);
    setProjectIdState(id);
    listeners.forEach((l) => l(id));
  }, []);

  return { projectId, setProjectId };
}
