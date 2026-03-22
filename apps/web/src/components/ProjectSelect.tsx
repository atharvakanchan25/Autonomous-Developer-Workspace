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
  placeholder = "Select a project…",
}: ProjectSelectProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null);
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none ${className}`}
    >
      <option value="">{placeholder}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
