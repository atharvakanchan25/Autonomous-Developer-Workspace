import { prisma } from "../../lib/prisma";
import { notFound, badRequest } from "../../lib/errors";
import { CreateFileInput, UpdateFileInput, RenameFileInput } from "./files.schema";

const MAX_VERSIONS = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    prisma: "prisma", env: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listFiles(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw notFound("Project");

  return prisma.projectFile.findMany({
    where: { projectId },
    orderBy: { path: "asc" },
    select: {
      id: true, path: true, name: true, language: true,
      size: true, createdAt: true, updatedAt: true,
      _count: { select: { versions: true } },
    },
  });
}

export async function getFile(id: string) {
  const file = await prisma.projectFile.findUnique({ where: { id } });
  if (!file) throw notFound("File");
  return file;
}

export async function createFile(data: CreateFileInput) {
  const project = await prisma.project.findUnique({ where: { id: data.projectId }, select: { id: true } });
  if (!project) throw notFound("Project");

  const existing = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: data.projectId, path: data.path } },
  });
  if (existing) throw badRequest(`A file already exists at "${data.path}"`);

  const language = data.language !== "plaintext" ? data.language : detectLanguage(data.name);

  return prisma.projectFile.create({
    data: {
      projectId: data.projectId,
      path: data.path,
      name: data.name,
      language,
      content: data.content,
      size: Buffer.byteLength(data.content, "utf8"),
    },
  });
}

export async function updateFile(id: string, data: UpdateFileInput) {
  const file = await prisma.projectFile.findUnique({ where: { id } });
  if (!file) throw notFound("File");

  return prisma.$transaction(async (tx) => {
    // Snapshot current content as a version if requested
    if (data.createVersion && file.content) {
      const versionCount = await tx.fileVersion.count({ where: { fileId: id } });

      // Prune oldest versions beyond the cap
      if (versionCount >= MAX_VERSIONS) {
        const oldest = await tx.fileVersion.findMany({
          where: { fileId: id },
          orderBy: { createdAt: "asc" },
          take: versionCount - MAX_VERSIONS + 1,
          select: { id: true },
        });
        await tx.fileVersion.deleteMany({ where: { id: { in: oldest.map((v) => v.id) } } });
      }

      await tx.fileVersion.create({
        data: {
          fileId: id,
          content: file.content,
          size: file.size,
          label: data.versionLabel ?? null,
        },
      });
    }

    return tx.projectFile.update({
      where: { id },
      data: {
        content: data.content,
        size: Buffer.byteLength(data.content, "utf8"),
      },
    });
  });
}

export async function renameFile(id: string, data: RenameFileInput) {
  const file = await prisma.projectFile.findUnique({ where: { id } });
  if (!file) throw notFound("File");

  const conflict = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: file.projectId, path: data.path } },
  });
  if (conflict && conflict.id !== id) throw badRequest(`A file already exists at "${data.path}"`);

  const language = detectLanguage(data.name);

  return prisma.projectFile.update({
    where: { id },
    data: { path: data.path, name: data.name, language },
  });
}

export async function deleteFile(id: string) {
  const file = await prisma.projectFile.findUnique({ where: { id } });
  if (!file) throw notFound("File");
  await prisma.projectFile.delete({ where: { id } });
}

export async function listVersions(fileId: string) {
  const file = await prisma.projectFile.findUnique({ where: { id: fileId }, select: { id: true } });
  if (!file) throw notFound("File");

  return prisma.fileVersion.findMany({
    where: { fileId },
    orderBy: { createdAt: "desc" },
    select: { id: true, size: true, label: true, createdAt: true },
  });
}

export async function getVersion(versionId: string) {
  const version = await prisma.fileVersion.findUnique({ where: { id: versionId } });
  if (!version) throw notFound("FileVersion");
  return version;
}

export async function restoreVersion(fileId: string, versionId: string) {
  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file) throw notFound("File");

  const version = await prisma.fileVersion.findUnique({ where: { id: versionId } });
  if (!version || version.fileId !== fileId) throw notFound("FileVersion");

  return updateFile(fileId, {
    content: version.content,
    createVersion: true,
    versionLabel: `Before restore to ${version.createdAt.toISOString()}`,
  });
}
