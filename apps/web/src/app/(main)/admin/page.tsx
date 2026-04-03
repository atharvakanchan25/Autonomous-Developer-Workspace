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

const SUPERUSER_EMAIL = "aryankanchan@adw.com";

export default function AdminPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const isSuperuser = user?.email === SUPERUSER_EMAIL;

  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [projects, setProjects] = useState<
    Array<Project & { ownerEmail: string; taskCount: number }>
  >([]);
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
  const [userSearch, setUserSearch] = useState("");

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
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <div className="p-3 border-b border-gray-700">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full bg-[#0f1419] border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500"
              />
            </div>
            <table className="w-full text-sm text-left">
  <thead className="bg-[#111827] text-gray-400">
    <tr>
      <th className="px-4 py-3">Email</th>
      <th className="px-4 py-3">Role</th>
      <th className="px-4 py-3">Created</th>
      <th className="px-4 py-3">Actions</th>
    </tr>
  </thead>

  <tbody>
    {users.filter((u) => u.email.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
      <tr
        key={u.uid}
        onClick={() => openUser(u)}
        className="border-t border-gray-700 hover:bg-[#111827] cursor-pointer"
      >
        <td className="px-4 py-3 text-gray-200">{u.email}</td>

        <td className="px-4 py-3">
          <span className="px-2 py-1 text-xs rounded-full border">
            {u.role}
          </span>
        </td>

        <td className="px-4 py-3 text-gray-400">
          {new Date(u.createdAt).toLocaleDateString()}
        </td>

        <td className="px-4 py-3 flex gap-2">
          <select
            value={u.role}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => changeRole(u.uid, e.target.value)}
            className="bg-[#0f1419] border border-gray-600 text-xs px-2 py-1 rounded"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>

          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteUser(u.uid);
            }}
            className="text-red-400 text-xs"
          >
            Delete
          </button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
          </div>
        ) : tab === "admins" ? (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <table className="w-full text-sm text-left">
  <thead className="bg-[#111827] text-gray-400">
    <tr>
      <th className="px-4 py-3">Email</th>
      <th className="px-4 py-3">Role</th>
      <th className="px-4 py-3">Actions</th>
    </tr>
  </thead>

  <tbody>
    {users
      .filter((u) => u.role === "admin")
      .map((u) => (
        <tr key={u.uid} className="border-t border-gray-700">
          <td className="px-4 py-3 text-gray-200">{u.email}</td>

          <td className="px-4 py-3">
            <span className="px-2 py-1 text-xs rounded-full border border-indigo-700 bg-indigo-900/30 text-indigo-400">
              admin
            </span>
          </td>

          <td className="px-4 py-3">
            {isSuperuser && (
              <button
                onClick={() => changeRole(u.uid, "user")}
                className="text-yellow-400 text-xs"
              >
                Remove Admin
              </button>
            )}
          </td>
        </tr>
      ))}
  </tbody>
</table>
          </div>
        ) : tab === "tokens" ? (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <div className="space-y-4 p-4">
  {tokenUsage.map((u) => (
    <div
      key={u.uid}
      onClick={() => openTokenCalls(u)}
      className="p-4 border border-gray-700 rounded cursor-pointer hover:bg-[#111827]"
    >
      <p className="text-gray-200">{u.email}</p>

      <div className="w-full bg-gray-800 h-2 rounded mt-2">
        <div
          className={`h-2 rounded ${u.limitExceeded ? "bg-red-500" : "bg-indigo-500"}`}
          style={{ width: `${Math.min((u.totalTokens / u.limit) * 100, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-gray-400">{u.totalTokens.toLocaleString()} / {u.limit.toLocaleString()}</p>
        {u.limitExceeded && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-red-700 bg-red-900/30 text-red-400">⚠ Limit Exceeded</span>
        )}
      </div>
    </div>
  ))}

  {tokenUsage.length === 0 && (
    <p className="text-gray-500 text-sm text-center">No token data</p>
  )}
</div>
          </div>
        ) : tab === "audit" ? (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <div className="space-y-4 p-4">
  <select
    value={auditFilter}
    onChange={(e) => setAuditFilter(e.target.value)}
    className="bg-[#0f1419] border border-gray-600 px-2 py-1 text-sm"
  >
    {uniqueActions.map((a) => (
      <option key={a}>{a}</option>
    ))}
  </select>

  {filteredLogs.map((log) => {
    const badge = actionBadge(log.action);
    const summary = metaSummary(log.action, log.meta);
    return (
      <div key={log.id} className={`flex items-start gap-3 border rounded p-3 ${badge.color}`}>
        <span className="text-base">{badge.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">{badge.label}</p>
            <span className="text-[10px] opacity-60">{log.email}</span>
          </div>
          {summary && <p className="text-xs opacity-70 truncate mt-0.5">{summary}</p>}
        </div>
        <span className="text-[10px] opacity-60 shrink-0">{timeAgo(log.createdAt)}</span>
      </div>
    );
  })}

  {filteredLogs.length === 0 && (
    <p className="text-gray-500 text-sm text-center">No logs found</p>
  )}
</div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <div className="space-y-4 p-4">
              {projects.map((p) => (
                <div key={p.id} className="border border-gray-700 p-4 rounded">
                  <p className="text-gray-200 font-medium">{p.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Owner: {(p as any).ownerEmail ?? "—"}</p>
                  <p className="text-sm text-gray-400 mt-1">Tasks: {p.taskCount ?? 0}</p>
                  <button
                    onClick={() => deleteProject(p.id, p.name)}
                    className="text-red-400 text-xs mt-2 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {projects.length === 0 && (
                <p className="text-gray-500 text-sm text-center">No projects found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── User Detail Drawer ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setSelectedUser(null)} />
          <div className="w-[480px] bg-[#1a1f2e] border-l border-gray-700 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div>
                <p className="text-gray-100 font-medium">{selectedUser.email}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  selectedUser.role === "admin"
                    ? "border-indigo-700 bg-indigo-900/30 text-indigo-400"
                    : "border-gray-600 bg-gray-800 text-gray-400"
                }`}>{selectedUser.role}</span>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-gray-700 px-4">
              {(["overview", "projects", "activity", "tokens"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setUserTab(t)}
                  className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    userTab === t ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {userLoading ? (
                <div className="flex justify-center py-8">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
                </div>
              ) : userError ? (
                <p className="text-red-400 text-sm">{userError}</p>
              ) : userTab === "overview" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Projects", value: userActivity?.stats.projectCount ?? 0 },
                      { label: "Tasks", value: userActivity?.stats.taskCount ?? 0 },
                      { label: "Actions", value: userActivity?.stats.actionCount ?? 0 },
                    ].map((s) => (
                      <div key={s.label} className="bg-[#111827] rounded p-3 text-center border border-gray-700">
                        <p className="text-xl font-semibold text-gray-100">{s.value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>UID: <span className="text-gray-400 font-mono">{selectedUser.uid}</span></p>
                    <p>Joined: <span className="text-gray-400">{new Date(selectedUser.createdAt).toLocaleDateString()}</span></p>
                  </div>
                </div>
              ) : userTab === "projects" ? (
                <div className="space-y-3">
                  {userProjects.length === 0 && <p className="text-gray-500 text-sm">No projects</p>}
                  {userProjects.map((p) => (
                    <div key={p.id} className="border border-gray-700 rounded p-3">
                      <p className="text-gray-200 text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.taskCount} tasks · {new Date(p.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              ) : userTab === "activity" ? (
                <div className="space-y-2">
                  {userActivity?.activity.length === 0 && <p className="text-gray-500 text-sm">No activity</p>}
                  {userActivity?.activity.map((a) => {
                    const badge = actionBadge(a.action);
                    const summary = metaSummary(a.action, a.meta);
                    return (
                      <div key={a.id} className={`flex items-start gap-2 border rounded p-2 ${badge.color}`}>
                        <span className="text-base">{badge.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{badge.label}</p>
                          {summary && <p className="text-xs opacity-70 truncate">{summary}</p>}
                        </div>
                        <span className="text-[10px] opacity-60 shrink-0">{timeAgo(a.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {userTokens.length === 0 && <p className="text-gray-500 text-sm">No token calls</p>}
                  {userTokens.map((t) => (
                    <div key={t.id} className="border border-gray-700 rounded p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-300 font-medium">{t.agentType}</span>
                        <span className="text-xs text-indigo-400">{t.tokensUsed} tokens</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">{timeAgo(t.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Token Calls Modal ── */}
      {tokenUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setTokenUser(null)} />
          <div className="relative bg-[#1a1f2e] border border-gray-700 rounded-lg w-[520px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div>
                <p className="text-gray-100 font-medium">{tokenUser.email}</p>
                <p className="text-xs text-gray-500">{tokenUser.totalTokens} / {tokenUser.limit} tokens used</p>
              </div>
              <button onClick={() => setTokenUser(null)} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {tokenCallsLoading ? (
                <div className="flex justify-center py-6">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
                </div>
              ) : tokenCalls.length === 0 ? (
                <p className="text-gray-500 text-sm text-center">No calls found</p>
              ) : tokenCalls.map((c) => (
                <div key={c.id} className="border border-gray-700 rounded p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300 font-medium">{c.agentType}</span>
                    <span className="text-xs text-indigo-400">{c.tokensUsed} tokens</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className={`text-[10px] ${
                      c.status === "COMPLETED" ? "text-emerald-400" : "text-red-400"
                    }`}>{c.status}</span>
                    <span className="text-[10px] text-gray-500">{timeAgo(c.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
