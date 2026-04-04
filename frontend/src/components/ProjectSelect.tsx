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
      className={`app-input rounded-2xl px-3.5 py-2 text-xs font-medium hover:bg-white/5 [&>option]:bg-[#0d1823] [&>option]:text-gray-200 ${className}`}
    >
      <option value="" className="bg-[#0d1823] text-gray-200">{placeholder}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id} className="bg-[#0d1823] text-gray-200">{p.name}</option>
      ))}
    </select>
  );
}
