"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/types";

interface ProjectSelectProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  placeholder?: string;
}

export function ProjectSelect({
  value,
  onChange,
  className = "",
  placeholder = "Select project…",
}: ProjectSelectProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null);
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-gray-700 bg-[#1a1f2e] px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800/50 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-900/50 transition-colors [&>option]:bg-[#1a1f2e] [&>option]:text-gray-300 ${className}`}
    >
      <option value="" className="bg-[#1a1f2e] text-gray-300">{placeholder}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id} className="bg-[#1a1f2e] text-gray-300">{p.name}</option>
      ))}
    </select>
  );
}
