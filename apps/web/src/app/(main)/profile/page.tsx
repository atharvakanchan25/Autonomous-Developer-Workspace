"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { api } from "@/lib/api";
import { auth, signOut } from "@/lib/firebase";
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
} from "firebase/auth";
import { PageShell } from "@/components/PageShell";
import type { UserTokenUsage, Alert } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-gray-200 ${mono ? "font-mono text-xs text-gray-400" : ""}`}>{value}</span>
    </div>
  );
}

function Section({ title, danger, children }: { title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${danger ? "text-red-500" : "text-gray-500"}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`rounded-xl border ${danger ? "border-red-900/50 bg-red-950/20" : "border-gray-700 bg-[#1a1f2e]"} divide-y divide-gray-700/60`}>
      {children}
    </div>
  );
}

function ActionRow({
  icon, title, description, action,
}: { icon: string; title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg">{icon}</span>
        <div>
          <p className="text-sm font-medium text-gray-200">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="ml-6 shrink-0">{action}</div>
    </div>
  );
}

function Btn({
  onClick, disabled, variant = "default", children,
}: { onClick?: () => void; disabled?: boolean; variant?: "default" | "danger" | "ghost"; children: React.ReactNode }) {
  const styles = {
    default: "border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700",
    danger: "border border-red-700 bg-red-900/30 text-red-400 hover:bg-red-900/60 hover:text-red-300",
    ghost: "border border-indigo-700 bg-indigo-900/20 text-indigo-400 hover:bg-indigo-900/40",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

function TokenBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-indigo-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>{used.toLocaleString()} used</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-700">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-600">
        <span>0</span>
        <span>{limit.toLocaleString()} limit</span>
      </div>
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-[#1a1f2e] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditNameModal({ current, onClose }: { current: string; onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: name.trim() });
      onClose();
      window.location.reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Display Name" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
        placeholder="Your name"
      />
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving} variant="ghost">{saving ? "Saving…" : "Save"}</Btn>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    if (!user || !user.email) return;
    if (next !== confirm) { setErr("Passwords don't match"); return; }
    if (next.length < 8) { setErr("Minimum 8 characters"); return; }
    setSaving(true);
    setErr("");
    try {
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      setOk(true);
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (ok) return (
    <Modal title="Password Changed" onClose={onClose}>
      <p className="text-sm text-green-400">Your password has been updated successfully.</p>
      <div className="mt-4 flex justify-end"><Btn onClick={onClose}>Close</Btn></div>
    </Modal>
  );

  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="space-y-3">
        {[
          { label: "Current password", val: current, set: setCurrent, type: "password" },
          { label: "New password", val: next, set: setNext, type: "password" },
          { label: "Confirm new password", val: confirm, set: setConfirm, type: "password" },
        ].map(({ label, val, set, type }) => (
          <div key={label}>
            <label className="mb-1 block text-xs text-gray-500">{label}</label>
            <input
              type={type}
              value={val}
              onChange={(e) => set(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
            />
          </div>
        ))}
      </div>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving} variant="ghost">{saving ? "Updating…" : "Update Password"}</Btn>
      </div>
    </Modal>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [tokenUsage, setTokenUsage] = useState<UserTokenUsage | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [showEditName, setShowEditName] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.profile.myTokenUsage().then(setTokenUsage).catch(() => {}),
      api.profile.myAlerts().then(setAlerts).catch(() => {}),
      api.projects.list().then(setProjects).catch(() => {}),
    ]).finally(() => setLoadingData(false));
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1419]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
      </div>
    );
  }

  const joined = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";

  const lastSignIn = user.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";

  const provider = user.providerData?.[0]?.providerId === "google.com" ? "Google"
    : user.providerData?.[0]?.providerId === "github.com" ? "GitHub" : "Email / Password";

  const isEmailProvider = provider === "Email / Password";

  async function handleSendVerification() {
    if (!user) return;
    setSendingVerification(true);
    try {
      await sendEmailVerification(user);
      setVerificationSent(true);
    } catch {
      // silently fail
    } finally {
      setSendingVerification(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut(auth);
    router.replace("/login");
  }

  async function handleDeleteAccount() {
    if (!confirm("Delete your account and ALL data permanently? This cannot be undone.")) return;
    setDeletingAccount(true);
    try {
      await api.profile.deleteAccount();
      await signOut(auth);
      router.replace("/login");
    } catch (e: any) {
      alert(e.message ?? "Failed to delete account");
      setDeletingAccount(false);
    }
  }

  return (
    <PageShell>
      {showEditName && <EditNameModal current={user.displayName ?? ""} onClose={() => setShowEditName(false)} />}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}

      <header className="flex h-14 shrink-0 items-center border-b border-gray-700 bg-[#1a1f2e] px-8">
        <h1 className="text-sm font-medium text-gray-100">Account</h1>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#0f1419]">
        <div className="mx-auto max-w-3xl px-8 py-8 space-y-8">

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                a.type === "error" ? "border-red-800 bg-red-900/20 text-red-300"
                : a.type === "warning" ? "border-amber-800 bg-amber-900/20 text-amber-300"
                : "border-indigo-800 bg-indigo-900/20 text-indigo-300"
              }`}>
                <span className="mt-0.5 text-base">{a.type === "error" ? "🚨" : a.type === "warning" ? "⚠️" : "📢"}</span>
                <div>
                  <p className="font-medium">{a.targetUid ? "Message for you" : "Broadcast"}</p>
                  <p className="mt-0.5 text-xs opacity-80">{a.message}</p>
                  <p className="mt-1 text-[10px] opacity-50">From {a.sentByEmail} · {new Date(a.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Profile */}
        <Section title="Profile">
          <Card>
            {/* Avatar + name row */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="h-12 w-12 rounded-full object-cover ring-2 ring-gray-700" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white ring-2 ring-gray-700">
                    {(user.displayName ?? user.email ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-100">{user.displayName ?? "—"}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>
              <Btn onClick={() => setShowEditName(true)}>Edit Name</Btn>
            </div>
            <Row label="Email" value={user.email ?? "—"} />
            <Row label="User ID" value={user.uid} mono />
            <Row label="Role" value={user.role ?? "user"} />
            <Row label="Sign-in Provider" value={provider} />
            <Row label="Joined" value={joined} />
            <Row label="Last Sign In" value={lastSignIn} />
          </Card>
        </Section>

        {/* Security */}
        <Section title="Security">
          <Card>
            <ActionRow
              icon="✉️"
              title="Email Verification"
              description={user.emailVerified ? "Your email address is verified." : "Verify your email to secure your account."}
              action={
                user.emailVerified ? (
                  <span className="rounded-full bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400">Verified</span>
                ) : verificationSent ? (
                  <span className="text-xs text-indigo-400">Email sent ✓</span>
                ) : (
                  <Btn onClick={handleSendVerification} disabled={sendingVerification} variant="ghost">
                    {sendingVerification ? "Sending…" : "Send Verification"}
                  </Btn>
                )
              }
            />
            {isEmailProvider && (
              <ActionRow
                icon="🔑"
                title="Password"
                description="Change your account password. You'll need your current password."
                action={<Btn onClick={() => setShowChangePw(true)}>Change Password</Btn>}
              />
            )}
            <ActionRow
              icon="🔐"
              title="Two-Factor Authentication"
              description="Add an extra layer of security to your account."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
            <ActionRow
              icon="📋"
              title="Active Sessions"
              description="View and manage devices signed into your account."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
          </Card>
        </Section>

        {/* Usage & Quota */}
        <Section title="Usage & Quota">
          {loadingData ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
              Loading…
            </div>
          ) : (
            <Card>
              <div className="grid grid-cols-3 gap-px bg-gray-700">
                {[
                  { label: "Projects", value: projects.length },
                  { label: "AI Calls", value: tokenUsage?.callCount ?? 0 },
                  { label: "Tokens Used", value: tokenUsage?.totalTokens.toLocaleString() ?? "0" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#1a1f2e] px-5 py-4">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="mt-1 text-xl font-semibold text-gray-100">{value}</p>
                  </div>
                ))}
              </div>
              {tokenUsage && (
                <div className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-gray-300">Token Quota</span>
                    {tokenUsage.limitExceeded ? (
                      <span className="rounded-full bg-red-900/30 px-2 py-1 text-xs font-medium text-red-400">Limit Exceeded</span>
                    ) : (
                      <span className="rounded-full bg-green-900/30 px-2 py-1 text-xs font-medium text-green-400">
                        {tokenUsage.remaining.toLocaleString()} remaining
                      </span>
                    )}
                  </div>
                  <TokenBar used={tokenUsage.totalTokens} limit={tokenUsage.limit} />
                  {tokenUsage.lastCallAt && (
                    <p className="mt-3 text-xs text-gray-600">Last used: {new Date(tokenUsage.lastCallAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </Card>
          )}
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <Card>
            <ActionRow
              icon="🎨"
              title="Theme"
              description="Switch between dark and light mode."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Dark (Default)</span>}
            />
            <ActionRow
              icon="🌐"
              title="Language"
              description="Choose your preferred interface language."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">English</span>}
            />
            <ActionRow
              icon="🔔"
              title="Notifications"
              description="Manage email and in-app notification preferences."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
            <ActionRow
              icon="⌨️"
              title="Default AI Language"
              description="Set the default programming language for code generation."
              action={<span className="rounded-full bg-indigo-900/40 px-3 py-1 text-xs text-indigo-300">Python</span>}
            />
          </Card>
        </Section>

        {/* Connected Apps */}
        <Section title="Connected Apps & Integrations">
          <Card>
            <ActionRow
              icon="🐙"
              title="GitHub"
              description="Connect GitHub to push generated code directly to repositories."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
            <ActionRow
              icon="☁️"
              title="AWS"
              description="Link your AWS account for one-click cloud deployments."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
            <ActionRow
              icon="🔗"
              title="Webhooks"
              description="Send task completion events to your own endpoints."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
          </Card>
        </Section>

        {/* Data & Privacy */}
        <Section title="Data & Privacy">
          <Card>
            <ActionRow
              icon="📦"
              title="Export My Data"
              description="Download all your projects, tasks, and generated code as a ZIP."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
            <ActionRow
              icon="🗑️"
              title="Clear All Projects"
              description="Delete all projects and tasks while keeping your account."
              action={<span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">Coming Soon</span>}
            />
          </Card>
        </Section>

        {/* Account Actions */}
        <Section title="Account Actions">
          <Card>
            <ActionRow
              icon="🚪"
              title="Sign Out"
              description="Sign out of your account on this device."
              action={
                <Btn onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign Out"}
                </Btn>
              }
            />
          </Card>
        </Section>

        {/* Danger Zone */}
        <Section title="Danger Zone" danger>
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">Delete Account</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Permanently deletes your account, all projects, tasks, and generated files. This cannot be undone.
                </p>
              </div>
              <Btn onClick={handleDeleteAccount} disabled={deletingAccount} variant="danger">
                {deletingAccount ? "Deleting…" : "Delete Account"}
              </Btn>
            </div>
          </div>
        </Section>

          <div className="pb-8" />
        </div>
      </main>
    </PageShell>
  );
}
