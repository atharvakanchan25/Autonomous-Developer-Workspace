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
  meta: Record<string, any>;
  createdAt: string;
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

interface AdminProject extends Project {
  ownerEmail: string;
  taskCount: number;
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

export default function AdminPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const isSuperuser = hasRole("admin");

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
  const totalTokens = tokenUsage.reduce((sum, u) => sum + u.totalTokens, 0);
  const exceededCount = tokenUsage.filter((u) => u.limitExceeded).length;

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
            <span className="mt-1 inline-block rounded-full border border-yellow-700 bg-yellow-900/30 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
              ADMIN
            </span>
            <button
              onClick={() => { setDataLoaded(false); }}
              disabled={loadingData}
              className="ml-3 rounded border border-gray-600 bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            >
              {loadingData ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>
        {!loadingData && (
          <div className="mt-4 grid grid-cols-5 gap-3">
            {[
              { label: "Total Users", value: users.length, color: "text-indigo-400" },
              { label: "Admins", value: users.filter((u) => u.role === "admin").length, color: "text-yellow-400" },
              { label: "Projects", value: projects.length, color: "text-emerald-400" },
              { label: "Total Tokens Used", value: totalTokens.toLocaleString(), color: "text-purple-400" },
              { label: "Limit Exceeded", value: exceededCount, color: exceededCount > 0 ? "text-red-400" : "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-gray-700 bg-[#0f1419] px-4 py-3">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
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
        ) : selectedUser ? (
          <UserDetailView
            user={selectedUser}
            userTab={userTab}
            setUserTab={setUserTab}
            userActivity={userActivity}
            userProjects={userProjects}
            userTokens={userTokens}
            userLoading={userLoading}
            userError={userError}
            onBack={() => setSelectedUser(null)}
            onChangeRole={changeRole}
            onDelete={deleteUser}
            isSuperuser={isSuperuser}
          />
        ) : tab === "users" ? (
          <UsersTable users={users} onSelectUser={openUser} />
        ) : tab === "admins" ? (
          <AdminsTable users={users.filter(u => u.role === "admin")} onSelectUser={openUser} />
        ) : tab === "tokens" ? (
          tokenUser ? (
            <TokenCallsView
              user={tokenUser}
              calls={tokenCalls}
              loading={tokenCallsLoading}
              onBack={() => setTokenUser(null)}
            />
          ) : (
            <TokenUsageTable usage={tokenUsage} onSelectUser={openTokenCalls} />
          )
        ) : tab === "audit" ? (
          <AuditLogsTable
            logs={filteredLogs}
            filter={auditFilter}
            setFilter={setAuditFilter}
            uniqueActions={uniqueActions}
          />
        ) : (
          <ProjectsTable projects={projects as AdminProject[]} onDelete={deleteProject} />
        )}
      </div>
    </div>
  );
}

function UsersTable({ users, onSelectUser }: { users: User[]; onSelectUser: (u: User) => void }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
      <table className="w-full">
        <thead className="border-b border-gray-700 bg-[#0f1419]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Role</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-800/50">
              <td className="px-4 py-3 text-sm text-gray-300">{u.email}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${u.role === "admin" ? "bg-yellow-900/30 text-yellow-400" : "bg-gray-700 text-gray-300"}`}>
                  {u.role}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(u.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onSelectUser(u)} className="text-sm text-indigo-400 hover:text-indigo-300">
                  View Details →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminsTable({ users, onSelectUser }: { users: User[]; onSelectUser: (u: User) => void }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
      <table className="w-full">
        <thead className="border-b border-gray-700 bg-[#0f1419]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-800/50">
              <td className="px-4 py-3 text-sm text-gray-300">{u.email}</td>
              <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(u.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onSelectUser(u)} className="text-sm text-indigo-400 hover:text-indigo-300">
                  View Details →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TokenUsageTable({ usage, onSelectUser }: { usage: TokenUsage[]; onSelectUser: (u: TokenUsage) => void }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
      <table className="w-full">
        <thead className="border-b border-gray-700 bg-[#0f1419]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">User</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Total Tokens</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Calls</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Remaining</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {usage.map((u) => (
            <tr key={u.uid} className="hover:bg-gray-800/50">
              <td className="px-4 py-3 text-sm text-gray-300">{u.email}</td>
              <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{u.totalTokens.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-sm text-gray-400">{u.callCount}</td>
              <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{u.remaining.toLocaleString()}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${u.limitExceeded ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}>
                  {u.limitExceeded ? "Exceeded" : "OK"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onSelectUser(u)} className="text-sm text-indigo-400 hover:text-indigo-300">
                  View Calls →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TokenCallsView({ user, calls, loading, onBack }: { user: TokenUsage; calls: TokenCall[]; loading: boolean; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm text-indigo-400 hover:text-indigo-300">← Back to Token Usage</button>
      <div className="mb-4 rounded-lg border border-gray-700 bg-[#1a1f2e] p-4">
        <h2 className="text-lg font-semibold text-gray-100">{user.email}</h2>
        <div className="mt-2 grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400">Total Tokens</p>
            <p className="text-xl font-mono text-gray-100">{user.totalTokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Calls</p>
            <p className="text-xl font-mono text-gray-100">{user.callCount}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Remaining</p>
            <p className="text-xl font-mono text-gray-100">{user.remaining.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Status</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-medium ${user.limitExceeded ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}>
              {user.limitExceeded ? "Exceeded" : "OK"}
            </span>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
          <table className="w-full">
            <thead className="border-b border-gray-700 bg-[#0f1419]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Agent Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Tokens</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {calls.map((c) => (
                <tr key={c.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm text-gray-300">{c.source}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{c.agentType}</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{c.tokensUsed.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${c.status === "success" ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditLogsTable({ logs, filter, setFilter, uniqueActions }: { logs: AuditLog[]; filter: string; setFilter: (f: string) => void; uniqueActions: string[] }) {
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {uniqueActions.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`rounded px-3 py-1 text-xs font-medium ${filter === a ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
        <table className="w-full">
          <thead className="border-b border-gray-700 bg-[#0f1419]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Details</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {logs.map((l) => {
              const badge = actionBadge(l.action);
              return (
                <tr key={l.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm text-gray-300">{l.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badge.color}`}>
                      {badge.icon} {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{metaSummary(l.action, l.meta)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(l.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTable({ projects, onDelete }: { projects: AdminProject[]; onDelete: (id: string, name: string) => void }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
      <table className="w-full">
        <thead className="border-b border-gray-700 bg-[#0f1419]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Owner</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Tasks</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-gray-800/50">
              <td className="px-4 py-3 text-sm font-medium text-gray-100">{p.name}</td>
              <td className="px-4 py-3 text-sm text-gray-400">{p.ownerEmail || "Unknown"}</td>
              <td className="px-4 py-3 text-right text-sm text-gray-400">{p.taskCount || 0}</td>
              <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(p.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onDelete(p.id, p.name)} className="text-sm text-red-400 hover:text-red-300">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserDetailView({
  user,
  userTab,
  setUserTab,
  userActivity,
  userProjects,
  userTokens,
  userLoading,
  userError,
  onBack,
  onChangeRole,
  onDelete,
  isSuperuser,
}: {
  user: User;
  userTab: "overview" | "projects" | "activity" | "tokens";
  setUserTab: (t: "overview" | "projects" | "activity" | "tokens") => void;
  userActivity: UserActivity | null;
  userProjects: UserProjects[];
  userTokens: TokenCall[];
  userLoading: boolean;
  userError: string | null;
  onBack: () => void;
  onChangeRole: (uid: string, role: string) => void;
  onDelete: (uid: string) => void;
  isSuperuser: boolean;
}) {
  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm text-indigo-400 hover:text-indigo-300">← Back to Users</button>
      <div className="mb-4 rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">{user.email}</h2>
            <p className="mt-1 text-sm text-gray-400">User ID: {user.uid}</p>
            <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${user.role === "admin" ? "bg-yellow-900/30 text-yellow-400" : "bg-gray-700 text-gray-300"}`}>
              {user.role}
            </span>
          </div>
          {isSuperuser && (
            <div className="flex gap-2">
              <select
                value={user.role}
                onChange={(e) => onChangeRole(user.uid, e.target.value)}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1 text-sm text-gray-300"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={() => onDelete(user.uid)} className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">
                Delete User
              </button>
            </div>
          )}
        </div>
        {userActivity && (
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-700 pt-4">
            <div>
              <p className="text-xs text-gray-400">Projects</p>
              <p className="text-2xl font-semibold text-gray-100">{userActivity.stats.projectCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Tasks</p>
              <p className="text-2xl font-semibold text-gray-100">{userActivity.stats.taskCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Actions</p>
              <p className="text-2xl font-semibold text-gray-100">{userActivity.stats.actionCount}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-2 border-b border-gray-700">
        {(["overview", "projects", "activity", "tokens"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setUserTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${userTab === t ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {userLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
        </div>
      ) : userError ? (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-400">{userError}</div>
      ) : userTab === "overview" ? (
        <div className="rounded-lg border border-gray-700 bg-[#1a1f2e] p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-100">User Information</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="text-sm text-gray-200">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">User ID</p>
              <p className="font-mono text-sm text-gray-200">{user.uid}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Role</p>
              <p className="text-sm text-gray-200">{user.role}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Created At</p>
              <p className="text-sm text-gray-200">{new Date(user.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      ) : userTab === "projects" ? (
        <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
          <table className="w-full">
            <thead className="border-b border-gray-700 bg-[#0f1419]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Tasks</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {userProjects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-100">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{p.description}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400">{p.taskCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : userTab === "activity" ? (
        <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
          <table className="w-full">
            <thead className="border-b border-gray-700 bg-[#0f1419]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Details</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {userActivity?.activity.map((a) => {
                const badge = actionBadge(a.action);
                return (
                  <tr key={a.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badge.color}`}>
                        {badge.icon} {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{metaSummary(a.action, a.meta)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(a.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-700 bg-[#1a1f2e]">
          <table className="w-full">
            <thead className="border-b border-gray-700 bg-[#0f1419]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Agent Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Tokens</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {userTokens.map((t) => (
                <tr key={t.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm text-gray-300">{t.source}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{t.agentType}</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-gray-300">{t.tokensUsed.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${t.status === "success" ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
