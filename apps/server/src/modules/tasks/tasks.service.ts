import { TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { notFound } from "../../lib/errors";
import { CreateTaskInput, UpdateTaskStatusInput } from "./tasks.schema";

export async function getAllTasks(projectId?: string) {
  return prisma.task.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { project: { select: { id: true, name: true } } },
  });
}

export async function getTaskById(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } } },
  });
  if (!task) throw notFound("Task");
  return task;
}

export async function createTask(data: CreateTaskInput) {
  const projectExists = await prisma.project.findUnique({
    where: { id: data.projectId },
    select: { id: true },
  });
  if (!projectExists) throw notFound("Project");

  return prisma.task.create({
    data,
    include: { project: { select: { id: true, name: true } } },
  });
}

export async function updateTaskStatus(id: string, data: UpdateTaskStatusInput) {
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!task) throw notFound("Task");

  return prisma.task.update({
    where: { id },
    data,
    include: { project: { select: { id: true, name: true } } },
  });
}

export { TaskStatus };
