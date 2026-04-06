"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/types";

let cachedProjects: Project[] | null = null;
let inFlightProjects: Promise<Project[]> | null = null;

export function invalidateProjectSelectCache() {
  cachedProjects = null;
  inFlightProjects = null;
}

async function loadProjects(force = false): Promise<Project[]> {
  if (!force && cachedProjects && cachedProjects.length > 0) return cachedProjects;
  if (inFlightProjects) return inFlightProjects;

  inFlightProjects = api.projects.list()
    .then((items) => {
      cachedProjects = items;
      return items;
    })
    .finally(() => {
      inFlightProjects = null;
    });

  return inFlightProjects;
}

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
  placeholder = "Select project...",
}: ProjectSelectProps) {
  const [projects, setProjects] = useState<Project[]>(cachedProjects ?? []);

  useEffect(() => {
    loadProjects(projects.length === 0).then(setProjects).catch(() => null);
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
