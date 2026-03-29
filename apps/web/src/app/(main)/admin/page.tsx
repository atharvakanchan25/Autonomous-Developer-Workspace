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

// ── helpers ──────────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  PROJECT_CREATE:  { label: "Created project",  color: "text-emerald-400 bg-emerald-900/30 border-emerald-800", icon: "📁" },
  PROJECT_UPDATE:  { label: "Updated project",  color: "text-blue-400 bg-blue-900/30 border-blue-800",         icon: "✏️" },
  PROJECT_DELETE:  { label: "Deleted project",  color: "text-red-400 bg-red-900/30 border-red-800",            icon: "🗑️" },
  TASK_CREATE:     { label: "Created task",     color: "text-emerald-400 bg-emerald-900/30 border-emerald-800", icon: "✅" },
  TASK_UPDATE:     { label: "Updated task",     color: "text-blue-400 bg-blue-900/30 border-blue-800",         icon: "🔧" },
  TASK_DELETE:     { label: "Deleted task",     color: "text-red-400 bg-red-900/30 border-red-800",            icon: "🗑️" },
  ROLE_CHANGE:     { label: "Changed role",     color: "text-yellow-400 bg-yellow-900/30 border-yellow-800",   icon: "🔑" },
  USER_DELETE:     { label: "Deleted user",     color: "text-red-400 bg-red-900/30 border-red-800",            icon: "👤" },
  FILE_CREATE:     { label: "Created file",     color: "text-purple-400 bg-purple-900/30 border-purple-800",   icon: "📄" },
  FILE_DELETE:     { label: "Deleted file",     color: "text-red-400 bg-red-900/30 border-red-800",            icon: "🗑️" },
  AGENT_RUN:       { label: "Ran agent",        color: "text-indigo-400 bg-indigo-900/30 border-indigo-800",   icon: "🤖" },
  CICD_TRIGGER:    { label: "Triggered CI/CD",  color: "text-orange-400 bg-orange-900/30 border-orange-800",   icon: "🚀" },
};

function actionBadge(action: string) {
  const m = ACTION_META[action] ?? { label: action, color: "text-gray-400 bg-gray-800 border-gray-700", icon: "•" };
  return m;
}

function metaSummary(action: string, meta: Record<string, string>): string {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.name)        parts.push(`"${meta.name}"`);
  if (meta.projectId)   parts.push(`project ${meta.projectId.slice(0, 8)}…`);
  if (meta.taskId)      parts.push(`task ${meta.taskId.slice(0, 8)}…`);
  if (meta.newRole)     parts.push(`→ ${meta.newRole}`);
  if (meta.targetUser)  parts.push(`user ${meta.targetUser.slice(0, 8)}…`);
  if (meta.agentType)   parts.push(meta.agentType);
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

// ── component ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const isSuperuser = user?.email === SUPERUSER_EMAIL;

  const [users, setUsers]           = useState<User[]>([]);
  const [auditLogs, setAuditLogs]   = useState<AuditLog[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [tab, setTab] = useState<"users" | "audit" | "projects" | "admins" | "tokens">("users");
  const [loadingData, setLoadingData] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // user drilldown
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userTab, setUserTab] = useState<"overview" | "projects" | "activity" | "tokens">("overview");
  const [userActivity, setUserActivity] = useState<UserActivity | null>(null);
  const [userProjects, setUserProjects] = useState<UserProjects[]>([]);
  const [userTokens, setUserTokens] = useState<TokenCall[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const [tokenUsage, setTokenUsage]               = useState<TokenUsage[]>([]);
  const [tokenUser, setTokenUser]                 = useState<TokenUsage | null>(null);
  const [tokenCalls, setTokenCalls]               = useState<TokenCall[]>([]);
  const [tokenCallsLoading, setTokenCallsLoading] = useState(false);

  // audit filter
  const [auditFilter, setAuditFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.replace("/home");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    if (user && hasRole("admin") && !dataLoaded) {
      console.log("[Admin] Loading admin data for user:", user.email, "role:", user.role);
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
      if (res.ok) { const d = await res.json(); setTokenUsage(Array.isArray(d) ? d : []); }
    } catch { setTokenUsage([]); }
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
      if (res.ok) { const d = await res.json(); setTokenCalls(Array.isArray(d) ? d : []); }
    } finally { setTokenCallsLoading(false); }
  }

  async function loadUsers() {
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        console.error("[Admin] No auth token available");
        return;
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        console.log("[Admin] Loaded users:", d.length);
        setUsers(Array.isArray(d) ? d : []);
      } else {
        console.error("[Admin] Failed to load users:", res.status);
      }
    } catch (err) {
      console.error("[Admin] Error loading users:", err);
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
      if (res.ok) { const d = await res.json(); setAuditLogs(Array.isArray(d) ? d : []); }
    } catch { setAuditLogs([]); }
  }

  async function loadProjects() {
    try { setProjects(await api.admin.projects()); } catch { /* ignore */ }
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
      
      console.log("[Admin] Loaded user profile for:", u.email);
    } catch (err) {
      console.error("[Admin] Error loading user profile:", err);
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
      if (res.ok) { await loadUsers(); await loadAuditLogs(); }
    } catch { /* ignore */ }
  }

  async function deleteUser(uid: string) {
    if (!confirm("Delete this user?")) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${uid}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { await loadUsers(); await loadAuditLogs(); }
    } catch { /* ignore */ }
  }

  async function deleteProject(id: string, name: string) {
    if (!confirm(`Delete project "${name}" and all its tasks?`)) return;
    try {
      await api.projects.delete(id);
      await loadProjects();
      await loadAuditLogs();
    } catch { /* ignore */ }
  }

  // ── derived ────────────────────────────────────────────────────────────────

  const filteredLogs = auditFilter === "ALL"
    ? auditLogs
    : auditLogs.filter((l) => l.action === auditFilter);

  const uniqueActions = ["ALL", ...Array.from(new Set(auditLogs.map((l) => l.action)))];

  // per-user action counts for the users table
  const actionCountByUser = auditLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.userId] = (acc[l.userId] ?? 0) + 1;
    return acc;
  }, {});

  // ── guard ──────────────────────────────────────────────────────────────────

  if (loading || !user || !hasRole("admin")) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1419]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1419]">
      {/* Header */}
      <div className="border-b border-gray-700 bg-[#1a1f2e] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Admin Panel</h1>
            <p className="text-sm text-gray-500">Manage users, projects, and activity</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Logged in as</p>
            <p className="text-sm font-medium text-gray-200">{user.email}</p>
            <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              user.email === SUPERUSER_EMAIL
                ? "border-indigo-700 bg-indigo-900/30 text-indigo-400"
                : "border-yellow-700 bg-yellow-900/30 text-yellow-400"
            }`}>
              {user.email === SUPERUSER_EMAIL ? "SUPERUSER" : "ADMIN"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 bg-[#1a1f2e] px-6">
        {(["users", "admins", "tokens", "audit", "projects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedUser(null); setTokenUser(null); }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "users"    ? `Users (${users.length})`
              : t === "admins"  ? `Admins (${users.filter((u) => u.role === "admin").length})`
              : t === "tokens"  ? `Token Usage (${tokenUsage.length})`
              : t === "audit"   ? `Audit Logs (${auditLogs.length})`
              : `Projects (${projects.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
          </div>

        ) : tab === "users" ? (
          selectedUser ? (
            /* ── User Profile Drilldown ── */
            <div>
              <button
                onClick={() => setSelectedUser(null)}
                className="mb-4 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                ← Back to users
              </button>

              {/* Profile header */}
              <div className="mb-6 rounded-xl border border-gray-700 bg-[#1a1f2e] p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-100">{selectedUser.email}</p>
                    <p className="mt-0.5 text-xs text-gray-500">UID: {selectedUser.uid}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Joined {new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    selectedUser.role === "admin"
                      ? "border-yellow-700 bg-yellow-900/30 text-yellow-400"
                      : "border-gray-700 bg-gray-800 text-gray-400"
                  }`}>
                    {selectedUser.role}
                  </span>
                </div>

                {/* Stats row */}
                {userActivity && (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { label: "Projects", value: userActivity.stats.projectCount },
                      { label: "Tasks",    value: userActivity.stats.taskCount },
                      { label: "Actions",  value: userActivity.stats.actionCount },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border border-gray-700 bg-[#0f1419] p-3 text-center">
                        <p className="text-xl font-bold text-gray-100">{s.value}</p>
                        <p className="text-xs text-gray-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sub-tabs */}
              <div className="mb-4 flex gap-2 border-b border-gray-700">
                {(["overview", "projects", "activity", "tokens"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setUserTab(t)}
                    className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      userTab === t
                        ? "border-b-2 border-indigo-500 text-indigo-400"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {userLoading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
                </div>
              ) : userError ? (
                <div className="rounded-lg border border-red-700 bg-red-900/20 p-4">
                  <p className="text-sm text-red-400">Error: {userError}</p>
                  <button
                    onClick={() => openUser(selectedUser)}
                    className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : userTab === "overview" ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-300">Account Details</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Email:</span>
                        <span className="text-gray-300">{selectedUser.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Role:</span>
                        <span className="text-gray-300">{selectedUser.role}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">User ID:</span>
                        <span className="font-mono text-gray-400">{selectedUser.uid}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Joined:</span>
                        <span className="text-gray-300">{new Date(selectedUser.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  {userActivity && (
                    <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-gray-300">Activity Summary</h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Projects:</span>
                          <span className="text-gray-300">{userActivity.stats.projectCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Tasks:</span>
                          <span className="text-gray-300">{userActivity.stats.taskCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Actions:</span>
                          <span className="text-gray-300">{userActivity.stats.actionCount}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : userTab === "projects" ? (
                <div>
                  {userProjects.length === 0 ? (
                    <p className="text-sm text-gray-500">No projects created yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {userProjects.map((p) => (
                        <div key={p.id} className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-200">{p.name}</p>
                              {p.description && (
                                <p className="mt-1 text-xs text-gray-500 line-clamp-2">{p.description}</p>
                              )}
                              <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-600">
                                <span>{p.taskCount} tasks</span>
                                <span>•</span>
                                <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : userTab === "tokens" ? (
                <div>
                  {userTokens.length === 0 ? (
                    <p className="text-sm text-gray-500">No token usage recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {userTokens.map((call) => (
                        <div key={call.id} className="rounded-lg border border-gray-700/50 bg-[#1a1f2e] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                                  call.source === "plan"
                                    ? "border-purple-700 bg-purple-900/30 text-purple-400"
                                    : "border-indigo-700 bg-indigo-900/30 text-indigo-400"
                                }`}>
                                  {call.agentType.replace(/_/g, " ")}
                                </span>
                                <span className={`text-[11px] ${
                                  call.status === "COMPLETED" ? "text-emerald-400" :
                                  call.status === "FAILED" ? "text-red-400" : "text-gray-400"
                                }`}>{call.status}</span>
                                <span className="text-xs font-semibold text-gray-300">{call.tokensUsed.toLocaleString()} tokens</span>
                              </div>
                              {call.prompt && (
                                <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{call.prompt}</p>
                              )}
                            </div>
                            <span className="shrink-0 text-[11px] text-gray-600">{timeAgo(call.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : userTab === "activity" ? (
                <div>
                  {!userActivity || userActivity.activity.length === 0 ? (
                    <p className="text-sm text-gray-500">No activity recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {userActivity.activity.map((a) => {
                        const badge = actionBadge(a.action);
                        const summary = metaSummary(a.action, a.meta);
                        return (
                          <div key={a.id} className="flex items-start gap-3 rounded-lg border border-gray-700/50 bg-[#1a1f2e] px-4 py-3">
                            <span className="mt-0.5 text-base">{badge.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge.color}`}>
                                  {badge.label}
                                </span>
                                {summary && <span className="text-xs text-gray-400 truncate">{summary}</span>}
                              </div>
                              {a.meta && Object.keys(a.meta).length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                  {Object.entries(a.meta).map(([k, v]) => (
                                    <span key={k} className="font-mono text-[10px] text-gray-600">
                                      {k}: <span className="text-gray-400">{String(v)}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 text-[11px] text-gray-600">{timeAgo(a.createdAt)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Users Table ── */
            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-gray-700 bg-[#0f1419]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">User ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Joined</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Actions</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-sm text-gray-300">{u.email}</td>
                      <td className="px-4 py-3">
                        {isSuperuser ? (
                          <select
                            value={u.role}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            className="rounded border border-gray-700 bg-[#0f1419] px-2 py-1 text-xs text-gray-300 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${
                            u.role === "admin"
                              ? "border-yellow-700 bg-yellow-900/30 text-yellow-400"
                              : "border-gray-700 bg-gray-800 text-gray-400"
                          }`}>{u.role}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.uid || "(pending)"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {actionCountByUser[u.uid] ?? 0} logged
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openUser(u)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            View Profile
                          </button>
                          {isSuperuser && (
                            <button
                              onClick={() => deleteUser(u.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )

        ) : tab === "audit" ? (
          /* ── Audit Logs ── */
          <div>
            {/* Filter bar */}
            <div className="mb-4 flex flex-wrap gap-2">
              {uniqueActions.map((a) => (
                <button
                  key={a}
                  onClick={() => setAuditFilter(a)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    auditFilter === a
                      ? "border-indigo-600 bg-indigo-900/40 text-indigo-300"
                      : "border-gray-700 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {a === "ALL" ? "All" : (ACTION_META[a]?.label ?? a)}
                  {a !== "ALL" && (
                    <span className="ml-1.5 text-gray-600">
                      {auditLogs.filter((l) => l.action === a).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const badge = actionBadge(log.action);
                const summary = metaSummary(log.action, log.meta);
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-gray-700/60 bg-[#1a1f2e] px-4 py-3 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-base">{badge.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-gray-300">{log.email}</span>
                          {log.role === "admin" && (
                            <span className="rounded border border-yellow-800 bg-yellow-900/20 px-1.5 py-0.5 text-[10px] text-yellow-500">
                              admin
                            </span>
                          )}
                          {summary && <span className="text-xs text-gray-500 truncate">{summary}</span>}
                        </div>
                        {log.meta && Object.keys(log.meta).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                            {Object.entries(log.meta).map(([k, v]) => (
                              <span key={k} className="font-mono text-[10px] text-gray-600">
                                {k}: <span className="text-gray-400">{String(v)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-gray-600">{timeAgo(log.createdAt)}</p>
                        <p className="text-[10px] text-gray-700">{new Date(log.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredLogs.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">No logs found</p>
              )}
            </div>
          </div>

        ) : tab === "tokens" ? (
          /* ── Token Usage Tab ── */
          tokenUser ? (
            <div>
              <button
                onClick={() => setTokenUser(null)}
                className="mb-4 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                ← Back to token usage
              </button>

              {/* Summary card */}
              <div className="mb-6 rounded-xl border border-gray-700 bg-[#1a1f2e] p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-100">{tokenUser.email}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{tokenUser.callCount} API calls</p>
                  </div>
                  {tokenUser.limitExceeded && (
                    <span className="rounded border border-red-700 bg-red-900/30 px-2 py-0.5 text-xs text-red-400">Limit exceeded</span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "Total tokens", value: tokenUser.totalTokens.toLocaleString() },
                    { label: "Remaining",    value: tokenUser.remaining.toLocaleString() },
                    { label: "Limit",        value: tokenUser.limit.toLocaleString() },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-gray-700 bg-[#0f1419] p-3 text-center">
                      <p className="text-xl font-bold text-gray-100">{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                    <span>Usage</span>
                    <span>{Math.min(100, Math.round((tokenUser.totalTokens / tokenUser.limit) * 100))}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tokenUser.limitExceeded ? "bg-red-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${Math.min(100, (tokenUser.totalTokens / tokenUser.limit) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">API Calls</h3>
              {tokenCallsLoading ? (
                <div className="flex justify-center py-8">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
                </div>
              ) : tokenCalls.length === 0 ? (
                <p className="text-sm text-gray-500">No calls recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {tokenCalls.map((call) => (
                    <div key={call.id} className="rounded-lg border border-gray-700/50 bg-[#1a1f2e] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                              call.source === "plan"
                                ? "border-purple-700 bg-purple-900/30 text-purple-400"
                                : "border-indigo-700 bg-indigo-900/30 text-indigo-400"
                            }`}>
                              {call.agentType.replace(/_/g, " ")}
                            </span>
                            <span className={`text-[11px] ${
                              call.status === "COMPLETED" ? "text-emerald-400" :
                              call.status === "FAILED" ? "text-red-400" : "text-gray-400"
                            }`}>{call.status}</span>
                            <span className="text-xs font-semibold text-gray-300">{call.tokensUsed.toLocaleString()} tokens</span>
                          </div>
                          {call.prompt && (
                            <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{call.prompt}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-600">{timeAgo(call.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Per-user token table */
            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-gray-700 bg-[#0f1419]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Total tokens</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Calls</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Remaining</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Usage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Last call</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenUsage.map((u) => (
                    <tr key={u.uid} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-300">{u.email}</p>
                        <p className="text-[11px] text-gray-600">{u.role}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-semibold ${
                          u.limitExceeded ? "text-red-400" : "text-gray-200"
                        }`}>{u.totalTokens.toLocaleString()}</span>
                        {u.limitExceeded && (
                          <span className="ml-2 rounded border border-red-800 bg-red-900/30 px-1.5 py-0.5 text-[10px] text-red-400">exceeded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{u.callCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{u.remaining.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                            <div
                              className={`h-full rounded-full ${
                                u.limitExceeded ? "bg-red-500" : "bg-indigo-500"
                              }`}
                              style={{ width: `${Math.min(100, (u.totalTokens / u.limit) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-500">
                            {Math.min(100, Math.round((u.totalTokens / u.limit) * 100))}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.lastCallAt ? timeAgo(u.lastCallAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openTokenCalls(u)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          View calls
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tokenUsage.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No token usage recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )

        ) : tab === "admins" ? (
          /* ── Admins Tab ── */
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-gray-700 bg-[#0f1419]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">User ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Joined</th>
                  {isSuperuser && <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.filter((u) => u.role === "admin").map((u) => (
                  <tr key={u.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {u.email}
                      {u.email === SUPERUSER_EMAIL && (
                        <span className="ml-2 rounded border border-indigo-700 bg-indigo-900/30 px-1.5 py-0.5 text-[10px] text-indigo-400">superuser</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.uid || "(pending)"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    {isSuperuser && (
                      <td className="px-4 py-3 text-right">
                        {u.email !== SUPERUSER_EMAIL && (
                          <button
                            onClick={() => changeRole(u.id, "user")}
                            className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                          >
                            Revoke admin
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {users.filter((u) => u.role === "admin").length === 0 && (
                  <tr><td colSpan={isSuperuser ? 4 : 3} className="px-4 py-8 text-center text-sm text-gray-500">No admins found</td></tr>
                )}
              </tbody>
            </table>
          </div>

        ) : (
          /* ── Projects Table ── */
          <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-gray-700 bg-[#0f1419]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Tasks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const owner = users.find((u) => u.uid === p.ownerId);
                  return (
                    <tr key={p.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-sm font-medium text-gray-300">{p.name}</td>
                      <td className="px-4 py-3 max-w-xs truncate text-xs text-gray-500">{p.description || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {owner ? (
                          <button
                            onClick={() => openUser(owner)}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            {owner.email}
                          </button>
                        ) : (
                          <span className="font-mono text-gray-600">{p.ownerId?.slice(0, 10)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{p._count?.tasks ?? 0}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteProject(p.id, p.name)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No projects found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
