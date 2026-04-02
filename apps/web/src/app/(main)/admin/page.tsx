"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import type { Project } from "@/types";

interface User {
  id: string;
  uid: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuditLog {
  id: string;
  userId: string;
  email: string;
  role: string;
  action: string;
  meta: Record<string, string>;
  createdAt: string;
}

interface UserActivity {
  uid: string;
  email: string;
  role: string;
  createdAt: string;
  stats: { projectCount: number; taskCount: number; actionCount: number };
  activity: { id: string; action: string; meta: Record<string, string>; createdAt: string }[];
}

interface UserProjects {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
}

interface TokenUsage {
  uid: string;
  email: string;
  role: string;
  totalTokens: number;
  callCount: number;
  lastCallAt: string | null;
  limit: number;
  remaining: number;
  limitExceeded: boolean;
}

interface TokenCall {
  id: string;
  source: "agent" | "plan";
  agentType: string;
  prompt: string;
  tokensUsed: number;
  status: string;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  PROJECT_CREATE: { label: "Created project", color: "text-emerald-400 bg-emerald-900/30 border-emerald-800", icon: "📁" },
  PROJECT_UPDATE: { label: "Updated project", color: "text-blue-400 bg-blue-900/30 border-blue-800", icon: "✏️" },
  PROJECT_DELETE: { label: "Deleted project", color: "text-red-400 bg-red-900/30 border-red-800", icon: "🗑️" },
  TASK_CREATE: { label: "Created task", color: "text-emerald-400 bg-emerald-900/30 border-emerald-800", icon: "✅" },
  TASK_UPDATE: { label: "Updated task", color: "text-blue-400 bg-blue-900/30 border-blue-800", icon: "🔧" },
  TASK_DELETE: { label: "Deleted task", color: "text-red-400 bg-red-900/30 border-red-800", icon: "🗑️" },
  ROLE_CHANGE: { label: "Changed role", color: "text-yellow-400 bg-yellow-900/30 border-yellow-800", icon: "🔑" },
  USER_DELETE: { label: "Deleted user", color: "text-red-400 bg-red-900/30 border-red-800", icon: "👤" },
  FILE_CREATE: { label: "Created file", color: "text-purple-400 bg-purple-900/30 border-purple-800", icon: "📄" },
  FILE_DELETE: { label: "Deleted file", color: "text-red-400 bg-red-900/30 border-red-800", icon: "🗑️" },
  AGENT_RUN: { label: "Ran agent", color: "text-indigo-400 bg-indigo-900/30 border-indigo-800", icon: "🤖" },
  CICD_TRIGGER: { label: "Triggered CI/CD", color: "text-orange-400 bg-orange-900/30 border-orange-800", icon: "🚀" },
};

function actionBadge(action: string) {
  const m = ACTION_META[action] ?? { label: action, color: "text-gray-400 bg-gray-800 border-gray-700", icon: "•" };
  return m;
}

function metaSummary(action: string, meta: Record<string, string>): string {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.name) parts.push(`"${meta.name}"`);
  if (meta.projectId) parts.push(`project ${meta.projectId.slice(0, 8)}…`);
  if (meta.taskId) parts.push(`task ${meta.taskId.slice(0, 8)}…`);
  if (meta.newRole) parts.push(`→ ${meta.newRole}`);
  if (meta.targetUser) parts.push(`user ${meta.targetUser.slice(0, 8)}…`);
  if (meta.agentType) parts.push(meta.agentType);
  return parts.join(" · ");
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SUPERUSER_EMAIL = "aryankanchan@adw.com";

export default function AdminPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const isSuperuser = user?.email === SUPERUSER_EMAIL;

  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<"users" | "audit" | "projects" | "admins" | "tokens">("users");
  const [loadingData, setLoadingData] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userTab, setUserTab] = useState<"overview" | "projects" | "activity" | "tokens">("overview");
  const [userActivity, setUserActivity] = useState<UserActivity | null>(null);
  const [userProjects, setUserProjects] = useState<UserProjects[]>([]);
  const [userTokens, setUserTokens] = useState<TokenCall[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([]);
  const [tokenUser, setTokenUser] = useState<TokenUsage | null>(null);
  const [tokenCalls, setTokenCalls] = useState<TokenCall[]>([]);
  const [tokenCallsLoading, setTokenCallsLoading] = useState(false);

  const [auditFilter, setAuditFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.replace("/home");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    if (user && hasRole("admin") && !dataLoaded) {
      loadData();
      setDataLoaded(true);
    }
  }, [user, hasRole, dataLoaded]);

  async function loadData() {
    setLoadingData(true);
    await Promise.all([loadUsers(), loadAuditLogs(), loadProjects(), loadTokenUsage()]);
    setLoadingData(false);
  }

  async function loadTokenUsage() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/token-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setTokenUsage(Array.isArray(d) ? d : []);
      }
    } catch {
      setTokenUsage([]);
    }
  }

  async function openTokenCalls(u: TokenUsage) {
    setTokenUser(u);
    setTokenCalls([]);
    setTokenCallsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/token-usage/${u.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setTokenCalls(Array.isArray(d) ? d : []);
      }
    } finally {
      setTokenCallsLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setUsers(Array.isArray(d) ? d : []);
      }
    } catch {
      setUsers([]);
    }
  }

  async function loadAuditLogs() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/audit-logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setAuditLogs(Array.isArray(d) ? d : []);
      }
    } catch {
      setAuditLogs([]);
    }
  }

  async function loadProjects() {
    try {
      setProjects(await api.admin.projects());
    } catch {
      // ignore
    }
  }

  async function openUser(u: User) {
    setSelectedUser(u);
    setUserTab("overview");
    setUserActivity(null);
    setUserProjects([]);
    setUserTokens([]);
    setUserLoading(true);
    setUserError(null);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("No auth token");

      const [actRes, projRes, tokRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${u.uid}/activity`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${u.uid}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/token-usage/${u.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (actRes.ok) setUserActivity(await actRes.json());
      if (projRes.ok) setUserProjects(await projRes.json());
      if (tokRes.ok) setUserTokens(await tokRes.json());
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to load user data");
    } finally {
      setUserLoading(false);
    }
  }

  async function changeRole(uid: string, role: string) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${uid}/role`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        await loadUsers();
        await loadAuditLogs();
      }
    } catch {
      // ignore
    }
  }

  async function deleteUser(uid: string) {
    if (!confirm("Delete this user?")) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadUsers();
        await loadAuditLogs();
      }
    } catch {
      // ignore
    }
  }

  async function deleteProject(id: string, name: string) {
    if (!confirm(`Delete project "${name}" and all its tasks?`)) return;
    try {
      await api.projects.delete(id);
      await loadProjects();
      await loadAuditLogs();
    } catch {
      // ignore
    }
  }

  const filteredLogs = auditFilter === "ALL" ? auditLogs : auditLogs.filter((l) => l.action === auditFilter);
  const uniqueActions = ["ALL", ...Array.from(new Set(auditLogs.map((l) => l.action)))];
  const actionCountByUser = auditLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.userId] = (acc[l.userId] ?? 0) + 1;
    return acc;
  }, {});
  const admins = users
    .filter((u) => u.role === "admin")
    .sort((a, b) => a.email.localeCompare(b.email));

  if (loading || !user || !hasRole("admin")) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1419]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1419]">
      <div className="border-b border-gray-700 bg-[#1a1f2e] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Admin Panel</h1>
            <p className="text-sm text-gray-500">Manage users, projects, and activity</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Logged in as</p>
            <p className="text-sm font-medium text-gray-200">{user.email}</p>
            <span
              className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                user.email === SUPERUSER_EMAIL
                  ? "border-indigo-700 bg-indigo-900/30 text-indigo-400"
                  : "border-yellow-700 bg-yellow-900/30 text-yellow-400"
              }`}
            >
              {user.email === SUPERUSER_EMAIL ? "SUPERUSER" : "ADMIN"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-700 bg-[#1a1f2e] px-6">
        {(["users", "admins", "tokens", "audit", "projects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelectedUser(null);
              setTokenUser(null);
            }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "users"
              ? `Users (${users.length})`
              : t === "admins"
              ? `Admins (${users.filter((u) => u.role === "admin").length})`
              : t === "tokens"
              ? `Token Usage (${tokenUsage.length})`
              : t === "audit"
              ? `Audit Logs (${auditLogs.length})`
              : `Projects (${projects.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
          </div>
        ) : tab === "users" ? (
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-[#1a1f2e]">
            {users.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No users found yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-[#22283a]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {users
                      .slice()
                      .sort((a, b) => a.email.localeCompare(b.email))
                      .map((u) => (
                        <tr key={u.uid} className="hover:bg-[#202638]">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-100">{u.email}</span>
                              <span className="text-xs text-gray-500">{u.uid}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                                u.role === "admin"
                                  ? "border-yellow-700 bg-yellow-900/30 text-yellow-400"
                                  : "border-gray-700 bg-gray-800 text-gray-300"
                              }`}
                            >
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">{formatDate(u.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{actionCountByUser[u.uid] ?? 0} actions</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : tab === "admins" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
              <p className="text-sm text-gray-300">Live admin accounts from the current backend role data.</p>
              <p className="mt-1 text-xs text-gray-500">Admins are resolved in real time from `/api/admin/users` and your backend admin email rules.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {admins.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4 text-sm text-gray-400">
                  No admins found.
                </div>
              ) : (
                admins.map((adminUser) => (
                  <div key={adminUser.uid} className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-100">{adminUser.email}</p>
                        <p className="mt-1 text-xs text-gray-500">{adminUser.uid}</p>
                      </div>
                      <span className="rounded-full border border-yellow-700 bg-yellow-900/30 px-2 py-1 text-[10px] font-medium text-yellow-400">
                        ADMIN
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Joined</span>
                        <span className="text-gray-300">{formatDate(adminUser.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Recent activity</span>
                        <span className="text-gray-300">{actionCountByUser[adminUser.uid] ?? 0} actions</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Status</span>
                        <span className="text-emerald-400">Active</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : tab === "tokens" ? (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <p className="p-4 text-sm text-gray-400">Token usage coming soon</p>
          </div>
        ) : tab === "audit" ? (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <p className="p-4 text-sm text-gray-400">Audit logs coming soon</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <p className="p-4 text-sm text-gray-400">Projects coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
  
