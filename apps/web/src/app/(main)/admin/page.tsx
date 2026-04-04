"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import type { Project } from "@/types";

type AdminProject = Project & {
  ownerId: string;
  ownerEmail: string;
  taskCount: number;
};

interface User {
  id: string;
  uid: string;
  email: string;
  role: string;
  createdAt: string;
  suspended?: boolean;
}

interface AuditLog {
  id: string;
  userId: string;
  email: string;
  role: string;
  action: string;
  meta: Record<string, any>;
  createdAt: string;
}

interface PlatformStats {
  users: { total: number; admins: number; regular: number };
  projects: { total: number };
  tasks: { total: number; completed: number };
  agentRuns: { total: number; completed: number; failed: number };
  auditLogs: { total: number };
  tokens: { total: number };
}

interface SystemHealth {
  database: { healthy: boolean; error?: string };
  queue: { depth: number; active_jobs: number; waiting_jobs: number; failed_jobs: number };
  timestamp: string;
}

interface UserActivity {
  uid: string;
  email: string;
  role: string;
  createdAt: string;
  stats: { projectCount: number; taskCount: number; actionCount: number };
  activity: { id: string; action: string; meta: Record<string, any>; createdAt: string }[];
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

const ACTION_META: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  PROJECT_CREATE: { label: "Created project", color: "text-emerald-400", icon: "", bg: "bg-emerald-900/20 border-emerald-800" },
  PROJECT_UPDATE: { label: "Updated project", color: "text-blue-400", icon: "", bg: "bg-blue-900/20 border-blue-800" },
  PROJECT_DELETE: { label: "Deleted project", color: "text-red-400", icon: "", bg: "bg-red-900/20 border-red-800" },
  TASK_CREATE: { label: "Created task", color: "text-emerald-400", icon: "", bg: "bg-emerald-900/20 border-emerald-800" },
  TASK_UPDATE: { label: "Updated task", color: "text-blue-400", icon: "", bg: "bg-blue-900/20 border-blue-800" },
  TASK_DELETE: { label: "Deleted task", color: "text-red-400", icon: "", bg: "bg-red-900/20 border-red-800" },
  ROLE_CHANGE: { label: "Changed role", color: "text-yellow-400", icon: "", bg: "bg-yellow-900/20 border-yellow-800" },
  USER_DELETE: { label: "Deleted user", color: "text-red-400", icon: "", bg: "bg-red-900/20 border-red-800" },
  USER_SUSPEND: { label: "Suspended user", color: "text-orange-400", icon: "", bg: "bg-orange-900/20 border-orange-800" },
  USER_UNSUSPEND: { label: "Unsuspended user", color: "text-green-400", icon: "", bg: "bg-green-900/20 border-green-800" },
  FILE_CREATE: { label: "Created file", color: "text-purple-400", icon: "", bg: "bg-purple-900/20 border-purple-800" },
  FILE_DELETE: { label: "Deleted file", color: "text-red-400", icon: "", bg: "bg-red-900/20 border-red-800" },
  AGENT_RUN: { label: "Ran agent", color: "text-indigo-400", icon: "", bg: "bg-indigo-900/20 border-indigo-800" },
  CICD_TRIGGER: { label: "Triggered CI/CD", color: "text-orange-400", icon: "", bg: "bg-orange-900/20 border-orange-800" },
};

function actionBadge(action: string) {
  const m = ACTION_META[action] ?? { label: action, color: "text-gray-400", icon: "", bg: "bg-gray-900/20 border-gray-800" };
  return m;
}

function metaSummary(action: string, meta: Record<string, any>): string {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.name) parts.push(`"${meta.name}"`);
  if (meta.projectId) parts.push(`project ${meta.projectId.slice(0, 8)}`);
  if (meta.taskId) parts.push(`task ${meta.taskId.slice(0, 8)}`);
  if (meta.newRole) parts.push(` ${meta.newRole}`);
  if (meta.targetUser) parts.push(`user ${meta.targetUser.slice(0, 8)}`);
  if (meta.agentType) parts.push(meta.agentType);
  return parts.join("  ");
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

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

const SUPERUSER_EMAIL = "aryankanchan@adw.com";

export default function AdminPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const isSuperuser = user?.email === SUPERUSER_EMAIL;

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "admins" | "tokens" | "audit" | "projects" | "system">("overview");
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
  const [auditUserFilter, setAuditUserFilter] = useState<string>("ALL");

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, dataLoaded]);

  async function loadData() {
    setLoadingData(true);
    await Promise.all([
      loadStats(),
      loadSystemHealth(),
      loadUsers(),
      loadAuditLogs(),
      loadProjects(),
      loadTokenUsage()
    ]);
    setLoadingData(false);
  }

  async function loadStats() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }

  async function loadSystemHealth() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/system-health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSystemHealth(await res.json());
      }
    } catch (error) {
      console.error("Failed to load system health:", error);
    }
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/audit-logs?limit=200`, {
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
        await loadStats();
      }
    } catch {
      // ignore
    }
  }

  async function suspendUser(uid: string, suspended: boolean) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${uid}/suspend`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ suspended }),
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
        await loadStats();
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
      await loadStats();
    } catch {
      // ignore
    }
  }

  const filteredLogs = auditLogs.filter((l) => {
    if (auditFilter !== "ALL" && l.action !== auditFilter) return false;
    if (auditUserFilter !== "ALL" && l.userId !== auditUserFilter) return false;
    return true;
  });

  const uniqueActions = ["ALL", ...Array.from(new Set(auditLogs.map((l) => l.action)))];
  const uniqueUsers = ["ALL", ...Array.from(new Set(auditLogs.map((l) => l.userId)))];
  const actionCountByUser = auditLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.userId] = (acc[l.userId] ?? 0) + 1;
    return acc;
  }, {});

  const regularUsers = users.filter((u) => u.role !== "admin");
  const admins = users.filter((u) => u.role === "admin");

  if (loading || !user || !hasRole("admin")) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1419]">
        <div className="text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500 mx-auto block mb-4" />
          <p className="text-gray-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1419]">
      {/* Header */}
      <div className="border-b border-gray-700 bg-[#1a1f2e] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Admin Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Comprehensive platform management and monitoring</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Administrator</p>
            <p className="text-sm font-medium text-gray-200">{user.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  user.email === SUPERUSER_EMAIL
                    ? "border-indigo-700 bg-indigo-900/30 text-indigo-400"
                    : "border-yellow-700 bg-yellow-900/30 text-yellow-400"
                }`}
              >
                {user.email === SUPERUSER_EMAIL ? "SUPERUSER" : "ADMIN"}
              </span>
              <span className="text-xs text-gray-500">
                Last login: {timeAgo(user.metadata?.lastSignInTime || "")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 border-b border-gray-700 bg-[#1a1f2e] px-6 overflow-x-auto">
        {[
          { id: "overview", label: "Overview", icon: "" },
          { id: "users", label: `Users (${regularUsers.length})`, icon: "" },
          { id: "admins", label: `Admins (${admins.length})`, icon: "" },
          { id: "tokens", label: `Token Usage (${tokenUsage.length})`, icon: "" },
          { id: "audit", label: `Audit Logs (${auditLogs.length})`, icon: "" },
          { id: "projects", label: `Projects (${projects.length})`, icon: "" },
          { id: "system", label: "System Health", icon: "" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id as any);
              setSelectedUser(null);
              setTokenUser(null);
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              tab === t.id
                ? "border-indigo-500 text-indigo-400 bg-indigo-900/10"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500 mx-auto block mb-4" />
              <p className="text-gray-400">Loading dashboard data...</p>
            </div>
          </div>
        ) : tab === "overview" ? (
          <div className="space-y-6">
            {/* Stats Overview */}
            {stats && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-blue-900/30 p-2">
                      <span className="text-blue-400"></span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-100">{formatNumber(stats.users.total)}</p>
                      <p className="text-sm text-gray-500">Total Users</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-yellow-400">{stats.users.admins} admins</span>
                    <span className="text-gray-400">{stats.users.regular} regular</span>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-green-900/30 p-2">
                      <span className="text-green-400"></span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-100">{formatNumber(stats.projects.total)}</p>
                      <p className="text-sm text-gray-500">Projects</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-purple-900/30 p-2">
                      <span className="text-purple-400"></span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-100">{formatNumber(stats.tasks.total)}</p>
                      <p className="text-sm text-gray-500">Tasks</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-green-400">
                    {stats.tasks.completed} completed ({Math.round((stats.tasks.completed / stats.tasks.total) * 100) || 0}%)
                  </div>
                </div>

                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-indigo-900/30 p-2">
                      <span className="text-indigo-400"></span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-100">{formatNumber(stats.agentRuns.total)}</p>
                      <p className="text-sm text-gray-500">Agent Runs</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-green-400">{stats.agentRuns.completed} success</span>
                    <span className="text-red-400">{stats.agentRuns.failed} failed</span>
                  </div>
                </div>
              </div>
            )}

            {/* System Health */}
            {systemHealth && (
              <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
                <h3 className="text-lg font-semibold text-gray-100 mb-4">System Health</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium text-gray-300 mb-2">Database</h4>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${systemHealth.database.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className={systemHealth.database.healthy ? 'text-green-400' : 'text-red-400'}>
                        {systemHealth.database.healthy ? 'Healthy' : 'Unhealthy'}
                      </span>
                    </div>
                    {systemHealth.database.error && (
                      <p className="text-xs text-red-400 mt-1">{systemHealth.database.error}</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-300 mb-2">Task Queue</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Queue Depth:</span>
                        <span className="text-gray-200">{systemHealth.queue.depth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Active Jobs:</span>
                        <span className="text-blue-400">{systemHealth.queue.active_jobs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Waiting:</span>
                        <span className="text-yellow-400">{systemHealth.queue.waiting_jobs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Failed:</span>
                        <span className="text-red-400">{systemHealth.queue.failed_jobs}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {auditLogs.slice(0, 10).map((log) => {
                  const meta = actionBadge(log.action);
                  return (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#22283a] border border-gray-700">
                      <span className="text-lg">{meta.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                          <span className="text-xs text-gray-500">by {log.email}</span>
                          <span className="text-xs text-gray-600">{timeAgo(log.createdAt)}</span>
                        </div>
                        {metaSummary(log.action, log.meta) && (
                          <p className="text-xs text-gray-400 mt-1">{metaSummary(log.action, log.meta)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : tab === "users" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-100">Regular Users</h2>
              <span className="text-sm text-gray-500">{regularUsers.length} users</span>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-[#22283a]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Joined</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Activity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {regularUsers
                      .sort((a, b) => a.email.localeCompare(b.email))
                      .map((u) => (
                        <tr key={u.uid} className="hover:bg-[#202638]">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-100">{u.email}</span>
                              <span className="text-xs text-gray-500">{u.uid.slice(0, 8)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                              u.suspended ? "border-red-700 bg-red-900/30 text-red-400" : "border-green-700 bg-green-900/30 text-green-400"
                            }`}>
                              {u.suspended ? "Suspended" : "Active"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">{formatDate(u.createdAt)}</td>
                          <td className="px-6 py-4 text-sm text-gray-400">{actionCountByUser[u.uid] ?? 0} actions</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => openUser(u)}
                                className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 rounded border border-blue-800 hover:bg-blue-900/50"
                              >
                                View
                              </button>
                              <button
                                onClick={() => suspendUser(u.uid, !u.suspended)}
                                className={`text-xs px-2 py-1 rounded border ${
                                  u.suspended
                                    ? "bg-green-900/30 text-green-400 border-green-800 hover:bg-green-900/50"
                                    : "bg-orange-900/30 text-orange-400 border-orange-800 hover:bg-orange-900/50"
                                }`}
                              >
                                {u.suspended ? "Unsuspend" : "Suspend"}
                              </button>
                              <button
                                onClick={() => changeRole(u.uid, "admin")}
                                className="text-xs px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded border border-yellow-800 hover:bg-yellow-900/50"
                              >
                                Make Admin
                              </button>
                              <button
                                onClick={() => deleteUser(u.uid)}
                                className="text-xs px-2 py-1 bg-red-900/30 text-red-400 rounded border border-red-800 hover:bg-red-900/50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : tab === "admins" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-100">Administrator Accounts</h2>
              <span className="text-sm text-gray-500">{admins.length} admins</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {admins.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6 text-center text-gray-400">
                  No administrators found.
                </div>
              ) : (
                admins.map((admin) => (
                  <div key={admin.uid} className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex-1">
                        <p className="text-lg font-semibold text-gray-100">{admin.email}</p>
                        <p className="text-sm text-gray-500 mt-1">{admin.uid.slice(0, 12)}</p>
                      </div>
                      <span className="rounded-full border border-yellow-700 bg-yellow-900/30 px-3 py-1 text-xs font-medium text-yellow-400">
                        ADMIN
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Joined</span>
                        <span className="text-sm text-gray-300">{formatDate(admin.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Recent Activity</span>
                        <span className="text-sm text-gray-300">{actionCountByUser[admin.uid] ?? 0} actions</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Status</span>
                        <span className="text-green-400 text-sm">Active</span>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => openUser(admin)}
                        className="flex-1 text-xs px-3 py-2 bg-blue-900/30 text-blue-400 rounded border border-blue-800 hover:bg-blue-900/50"
                      >
                        View Details
                      </button>
                      {isSuperuser && admin.email !== SUPERUSER_EMAIL && (
                        <button
                          onClick={() => changeRole(admin.uid, "user")}
                          className="text-xs px-3 py-2 bg-red-900/30 text-red-400 rounded border border-red-800 hover:bg-red-900/50"
                        >
                          Demote
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : tab === "tokens" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-100">Token Usage Analytics</h2>
              <span className="text-sm text-gray-500">{tokenUsage.length} users with token usage</span>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-[#22283a]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Total Tokens</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">API Calls</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Last Activity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {tokenUsage
                      .sort((a, b) => b.totalTokens - a.totalTokens)
                      .map((u) => (
                        <tr key={u.uid} className="hover:bg-[#202638]">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-100">{u.email}</span>
                              <span className="text-xs text-gray-500">{u.role}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-100">{formatNumber(u.totalTokens)}</span>
                              <span className="text-xs text-gray-500">of {formatNumber(u.limit)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">{u.callCount}</td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            {u.lastCallAt ? timeAgo(u.lastCallAt) : "Never"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                              u.limitExceeded
                                ? "border-red-700 bg-red-900/30 text-red-400"
                                : u.remaining < u.limit * 0.1
                                ? "border-yellow-700 bg-yellow-900/30 text-yellow-400"
                                : "border-green-700 bg-green-900/30 text-green-400"
                            }`}>
                              {u.limitExceeded ? "Over Limit" : u.remaining < u.limit * 0.1 ? "Low" : "Good"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => openTokenCalls(u)}
                              className="text-xs px-3 py-1 bg-indigo-900/30 text-indigo-400 rounded border border-indigo-800 hover:bg-indigo-900/50"
                            >
                              View Calls
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Token Calls Modal */}
            {tokenUser && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-[#1a1f2e] rounded-lg border border-gray-700 max-w-4xl w-full max-h-[80vh] overflow-hidden">
                  <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-100">
                        Token Usage Details - {tokenUser.email}
                      </h3>
                      <button
                        onClick={() => setTokenUser(null)}
                        className="text-gray-400 hover:text-gray-200"
                      >
                        
                      </button>
                    </div>
                  </div>

                  <div className="p-6 overflow-y-auto max-h-96">
                    {tokenCallsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
                      </div>
                    ) : tokenCalls.length === 0 ? (
                      <p className="text-gray-400 text-center py-8">No token usage records found.</p>
                    ) : (
                      <div className="space-y-3">
                        {tokenCalls.map((call) => (
                          <div key={call.id} className="p-4 rounded-lg bg-[#22283a] border border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${
                                  call.source === "agent" ? "text-indigo-400" : "text-purple-400"
                                }`}>
                                  {call.source === "agent" ? "" : ""} {call.agentType}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  call.status === "COMPLETED" ? "bg-green-900/30 text-green-400" :
                                  call.status === "FAILED" ? "bg-red-900/30 text-red-400" :
                                  "bg-yellow-900/30 text-yellow-400"
                                }`}>
                                  {call.status}
                                </span>
                              </div>
                              <span className="text-sm text-gray-400">{timeAgo(call.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-300 mb-2">{call.prompt.slice(0, 100)}...</p>
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>{call.tokensUsed} tokens used</span>
                              <span>{call.createdAt}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : tab === "audit" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-100">Audit Log</h2>
              <span className="text-sm text-gray-500">{filteredLogs.length} of {auditLogs.length} entries</span>
            </div>

            <div className="flex gap-4">
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="px-3 py-2 bg-[#22283a] border border-gray-700 rounded text-sm text-gray-200"
              >
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {action === "ALL" ? "All Actions" : action.replace(/_/g, " ")}
                  </option>
                ))}
              </select>

              <select
                value={auditUserFilter}
                onChange={(e) => setAuditUserFilter(e.target.value)}
                className="px-3 py-2 bg-[#22283a] border border-gray-700 rounded text-sm text-gray-200"
              >
                <option value="ALL">All Users</option>
                {uniqueUsers.filter(u => u !== "ALL").map((userId) => {
                  const user = users.find(u => u.uid === userId);
                  return (
                    <option key={userId} value={userId}>
                      {user?.email || userId.slice(0, 12) + ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <div className="divide-y divide-gray-800">
                  {filteredLogs.map((log) => {
                    const meta = actionBadge(log.action);
                    return (
                      <div key={log.id} className="p-4 hover:bg-[#202638]">
                        <div className="flex items-start gap-3">
                          <span className="text-lg mt-1">{meta.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                              <span className="text-xs text-gray-500">by {log.email}</span>
                              <span className="text-xs text-gray-600">{timeAgo(log.createdAt)}</span>
                            </div>
                            {metaSummary(log.action, log.meta) && (
                              <p className="text-sm text-gray-400">{metaSummary(log.action, log.meta)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : tab === "projects" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-100">All Projects</h2>
              <span className="text-sm text-gray-500">{projects.length} projects</span>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-[#22283a]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Project</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Owner</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Tasks</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {projects
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-[#202638]">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-100">{p.name}</span>
                              <span className="text-xs text-gray-500">{p.description?.slice(0, 50)}...</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            {users.find(u => u.uid === p.ownerId)?.email || p.ownerId.slice(0, 12) + ""}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">{p.taskCount || 0}</td>
                          <td className="px-6 py-4 text-sm text-gray-300">{formatDate(p.createdAt)}</td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => deleteProject(p.id, p.name)}
                              className="text-xs px-3 py-1 bg-red-900/30 text-red-400 rounded border border-red-800 hover:bg-red-900/50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : tab === "system" ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-100">System Health & Monitoring</h2>

            {systemHealth && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">Database Status</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${systemHealth.database.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className={`text-sm font-medium ${systemHealth.database.healthy ? 'text-green-400' : 'text-red-400'}`}>
                        {systemHealth.database.healthy ? 'Database Connection Healthy' : 'Database Connection Failed'}
                      </span>
                    </div>
                    {systemHealth.database.error && (
                      <div className="p-3 bg-red-900/20 border border-red-800 rounded">
                        <p className="text-sm text-red-400">{systemHealth.database.error}</p>
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      Last checked: {timeAgo(systemHealth.timestamp)}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">Task Queue Status</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Queue Depth</span>
                      <span className="text-sm font-medium text-gray-200">{systemHealth.queue.depth}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Active Jobs</span>
                      <span className="text-sm font-medium text-blue-400">{systemHealth.queue.active_jobs}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Waiting Jobs</span>
                      <span className="text-sm font-medium text-yellow-400">{systemHealth.queue.waiting_jobs}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Failed Jobs</span>
                      <span className="text-sm font-medium text-red-400">{systemHealth.queue.failed_jobs}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">Quick Actions</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => loadData()}
                  className="p-3 bg-blue-900/30 text-blue-400 rounded border border-blue-800 hover:bg-blue-900/50 text-left"
                >
                  <div className="font-medium">Refresh All Data</div>
                  <div className="text-xs text-gray-400">Update stats, health checks, and logs</div>
                </button>
                <button
                  onClick={() => loadSystemHealth()}
                  className="p-3 bg-green-900/30 text-green-400 rounded border border-green-800 hover:bg-green-900/50 text-left"
                >
                  <div className="font-medium">Check System Health</div>
                  <div className="text-xs text-gray-400">Verify database and queue status</div>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* User Detail Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1a1f2e] rounded-lg border border-gray-700 max-w-6xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-100">{selectedUser.email}</h3>
                    <p className="text-sm text-gray-500 mt-1">User ID: {selectedUser.uid}</p>
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="text-gray-400 hover:text-gray-200 text-xl"
                  >
                    
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {userLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
                  </div>
                ) : userError ? (
                  <div className="text-center py-12">
                    <p className="text-red-400">{userError}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* User Overview */}
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                        <h4 className="font-medium text-gray-300 mb-2">Account Status</h4>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                          selectedUser.suspended ? "border-red-700 bg-red-900/30 text-red-400" : "border-green-700 bg-green-900/30 text-green-400"
                        }`}>
                          {selectedUser.suspended ? "Suspended" : "Active"}
                        </span>
                      </div>
                      <div className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                        <h4 className="font-medium text-gray-300 mb-2">Role</h4>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                          selectedUser.role === "admin" ? "border-yellow-700 bg-yellow-900/30 text-yellow-400" : "border-gray-700 bg-gray-800 text-gray-300"
                        }`}>
                          {selectedUser.role.toUpperCase()}
                        </span>
                      </div>
                      <div className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                        <h4 className="font-medium text-gray-300 mb-2">Joined</h4>
                        <p className="text-sm text-gray-200">{formatDate(selectedUser.createdAt)}</p>
                      </div>
                    </div>

                    {/* User Tabs */}
                    <div className="border-b border-gray-700">
                      <div className="flex gap-1">
                        {[
                          { id: "overview", label: "Overview" },
                          { id: "projects", label: "Projects" },
                          { id: "activity", label: "Activity" },
                          { id: "tokens", label: "Token Usage" },
                        ].map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setUserTab(t.id as any)}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                              userTab === t.id ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-gray-300"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tab Content */}
                    {userTab === "overview" && userActivity && (
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                          <h4 className="font-medium text-gray-300 mb-2">Projects</h4>
                          <p className="text-2xl font-bold text-gray-100">{userActivity.stats.projectCount}</p>
                        </div>
                        <div className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                          <h4 className="font-medium text-gray-300 mb-2">Tasks</h4>
                          <p className="text-2xl font-bold text-gray-100">{userActivity.stats.taskCount}</p>
                        </div>
                        <div className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                          <h4 className="font-medium text-gray-300 mb-2">Actions</h4>
                          <p className="text-2xl font-bold text-gray-100">{userActivity.stats.actionCount}</p>
                        </div>
                      </div>
                    )}

                    {userTab === "projects" && (
                      <div className="space-y-3">
                        {userProjects.length === 0 ? (
                          <p className="text-gray-400 text-center py-8">No projects found.</p>
                        ) : (
                          userProjects.map((p) => (
                            <div key={p.id} className="p-4 bg-[#22283a] rounded-lg border border-gray-700">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-medium text-gray-100">{p.name}</h4>
                                  <p className="text-sm text-gray-400 mt-1">{p.description}</p>
                                </div>
                                <div className="text-right text-sm text-gray-500">
                                  <p>{p.taskCount} tasks</p>
                                  <p>{formatDate(p.createdAt)}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {userTab === "activity" && userActivity && (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {userActivity.activity.length === 0 ? (
                          <p className="text-gray-400 text-center py-8">No activity found.</p>
                        ) : (
                          userActivity.activity.map((act) => {
                            const meta = actionBadge(act.action);
                            return (
                              <div key={act.id} className="p-3 bg-[#22283a] rounded-lg border border-gray-700">
                                <div className="flex items-center gap-2 mb-1">
                                  <span>{meta.icon}</span>
                                  <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                                  <span className="text-xs text-gray-500">{timeAgo(act.createdAt)}</span>
                                </div>
                                {metaSummary(act.action, act.meta) && (
                                  <p className="text-sm text-gray-400">{metaSummary(act.action, act.meta)}</p>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {userTab === "tokens" && (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {userTokens.length === 0 ? (
                          <p className="text-gray-400 text-center py-8">No token usage found.</p>
                        ) : (
                          userTokens.map((call) => (
                            <div key={call.id} className="p-3 bg-[#22283a] rounded-lg border border-gray-700">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${
                                    call.source === "agent" ? "text-indigo-400" : "text-purple-400"
                                  }`}>
                                    {call.source === "agent" ? "" : ""} {call.agentType}
                                  </span>
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    call.status === "COMPLETED" ? "bg-green-900/30 text-green-400" :
                                    call.status === "FAILED" ? "bg-red-900/30 text-red-400" :
                                    "bg-yellow-900/30 text-yellow-400"
                                  }`}>
                                    {call.status}
                                  </span>
                                </div>
                                <span className="text-sm text-gray-400">{timeAgo(call.createdAt)}</span>
                              </div>
                              <p className="text-sm text-gray-300 mb-2">{call.prompt.slice(0, 100)}...</p>
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>{call.tokensUsed} tokens used</span>
                                <span>{call.createdAt}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
