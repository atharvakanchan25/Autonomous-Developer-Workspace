"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import type { Alert } from "@/types";

export function AlertsBanner() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    api.profile.myAlerts().then(setAlerts).catch(() => {});
  }, [user]);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div className="shrink-0 space-y-1 px-4 pt-2">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm ${
            a.type === "error" ? "border-red-800 bg-red-900/20 text-red-300"
            : a.type === "warning" ? "border-amber-800 bg-amber-900/20 text-amber-300"
            : "border-indigo-800 bg-indigo-900/20 text-indigo-300"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span>{a.type === "error" ? "🚨" : a.type === "warning" ? "⚠️" : "📢"}</span>
            <span className="truncate">{a.message}</span>
            <span className="shrink-0 text-xs opacity-50">— {a.sentByEmail}</span>
          </div>
          <button
            onClick={() => setDismissed((p) => new Set([...p, a.id]))}
            className="shrink-0 text-xs opacity-50 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
