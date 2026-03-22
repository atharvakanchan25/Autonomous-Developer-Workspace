import { db } from "../../lib/firestore";
import { notFound, badRequest } from "../../lib/errors";
import { CreateFileInput, UpdateFileInput, RenameFileInput } from "./files.schema";

const MAX_VERSIONS = 50;

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript",
    json: "json", md: "markdown",
    css: "css", html: "html",
    py: "python", rs: "rust",
    go: "go", sh: "shell",
    yaml: "yaml", yml: "yaml",
    toml: "toml", sql: "sql",
    prisma: "plaintext", env: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

export async function listFiles(projectId: string) {
  const projectDoc = await db.collection("projects").doc(projectId).get();
  if (!projectDoc.exists) throw notFound("Project");

  const snap = await db.collection("projectFiles")
    .where("projectId", "==", projectId)
    .orderBy("path", "asc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, path: data.path, name: data.name, language: data.language, size: data.size, createdAt: data.createdAt, updatedAt: data.updatedAt };
  });
}

export async function getFile(id: string) {
  const doc = await db.collection("projectFiles").doc(id).get();
  if (!doc.exists) throw notFound("File");
  return { id: doc.id, ...doc.data() };
}

export async function createFile(data: CreateFileInput) {
  const projectDoc = await db.collection("projects").doc(data.projectId).get();
  if (!projectDoc.exists) throw notFound("Project");

  const existing = await db.collection("projectFiles")
    .where("projectId", "==", data.projectId)
    .where("path", "==", data.path)
    .limit(1)
    .get();
  if (!existing.empty) throw badRequest(`A file already exists at "${data.path}"`);

  const language = data.language !== "plaintext" ? data.language : detectLanguage(data.name);
  const now = new Date().toISOString();
  const ref = await db.collection("projectFiles").add({
    projectId: data.projectId,
    path: data.path,
    name: data.name,
    language,
    content: data.content,
    size: Buffer.byteLength(data.content, "utf8"),
    createdAt: now,
    updatedAt: now,
  });

  return { id: ref.id, ...data, language, size: Buffer.byteLength(data.content, "utf8"), createdAt: now, updatedAt: now };
}

export async function updateFile(id: string, data: UpdateFileInput) {
  const doc = await db.collection("projectFiles").doc(id).get();
  if (!doc.exists) throw notFound("File");
  const file = doc.data()!;

  if (data.createVersion && file.content) {
    const versionsSnap = await db.collection("fileVersions").where("fileId", "==", id).get();
    if (versionsSnap.size >= MAX_VERSIONS) {
      const sorted = versionsSnap.docs.sort((a, b) => a.data().createdAt.localeCompare(b.data().createdAt));
      const toDelete = sorted.slice(0, versionsSnap.size - MAX_VERSIONS + 1);
      await Promise.all(toDelete.map((d) => d.ref.delete()));
    }
    await db.collection("fileVersions").add({
      fileId: id,
      content: file.content,
      size: file.size,
      label: data.versionLabel ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  const now = new Date().toISOString();
  await db.collection("projectFiles").doc(id).update({
    content: data.content,
    size: Buffer.byteLength(data.content, "utf8"),
    updatedAt: now,
  });

  return { id, ...file, content: data.content, size: Buffer.byteLength(data.content, "utf8"), updatedAt: now };
}

export async function renameFile(id: string, data: RenameFileInput) {
  const doc = await db.collection("projectFiles").doc(id).get();
  if (!doc.exists) throw notFound("File");
  const file = doc.data()!;

  const conflict = await db.collection("projectFiles")
    .where("projectId", "==", file.projectId)
    .where("path", "==", data.path)
    .limit(1)
    .get();
  if (!conflict.empty && conflict.docs[0]!.id !== id) throw badRequest(`A file already exists at "${data.path}"`);

  const language = detectLanguage(data.name);
  const now = new Date().toISOString();
  await db.collection("projectFiles").doc(id).update({ path: data.path, name: data.name, language, updatedAt: now });
  return { id, ...file, path: data.path, name: data.name, language, updatedAt: now };
}

export async function deleteFile(id: string) {
  const doc = await db.collection("projectFiles").doc(id).get();
  if (!doc.exists) throw notFound("File");
  await db.collection("projectFiles").doc(id).delete();
}

export async function listVersions(fileId: string) {
  const doc = await db.collection("projectFiles").doc(fileId).get();
  if (!doc.exists) throw notFound("File");

  const snap = await db.collection("fileVersions")
    .where("fileId", "==", fileId)
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, size: v.size, label: v.label, createdAt: v.createdAt };
  });
}

export async function getVersion(versionId: string) {
  const doc = await db.collection("fileVersions").doc(versionId).get();
  if (!doc.exists) throw notFound("FileVersion");
  return { id: doc.id, ...doc.data() };
}

export async function restoreVersion(fileId: string, versionId: string) {
  const fileDoc = await db.collection("projectFiles").doc(fileId).get();
  if (!fileDoc.exists) throw notFound("File");

  const versionDoc = await db.collection("fileVersions").doc(versionId).get();
  if (!versionDoc.exists || versionDoc.data()!.fileId !== fileId) throw notFound("FileVersion");

  const version = versionDoc.data()!;
  return updateFile(fileId, {
    content: version.content,
    createVersion: true,
    versionLabel: `Before restore to ${version.createdAt}`,
  });
}
