import { db } from "../../lib/firestore";
import { notFound } from "../../lib/errors";
import { emitter } from "../../lib/emitter";
import { TaskStatus } from "./tasks.types";
import type { CreateTaskInput, UpdateTaskStatusInput } from "./tasks.schema";

export { TaskStatus };

export async function getAllTasks(projectId?: string) {
  let query = db.collection("tasks").orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  if (projectId) query = query.where("projectId", "==", projectId);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTaskById(id: string) {
  const doc = await db.collection("tasks").doc(id).get();
  if (!doc.exists) throw notFound("Task");
  return { id: doc.id, ...doc.data() };
}

export async function createTask(data: CreateTaskInput) {
  const projectDoc = await db.collection("projects").doc(data.projectId).get();
  if (!projectDoc.exists) throw notFound("Project");

  const now = new Date().toISOString();
  const ref = await db.collection("tasks").add({
    ...data,
    status: TaskStatus.PENDING,
    createdAt: now,
    updatedAt: now,
  });

  const task = { id: ref.id, ...data, status: TaskStatus.PENDING, createdAt: now, updatedAt: now };

  emitter.taskUpdated({
    taskId: task.id,
    projectId: task.projectId,
    status: task.status,
    title: task.title,
    updatedAt: now,
  });

  return task;
}

export async function updateTaskStatus(id: string, data: UpdateTaskStatusInput) {
  const doc = await db.collection("tasks").doc(id).get();
  if (!doc.exists) throw notFound("Task");

  const now = new Date().toISOString();
  await db.collection("tasks").doc(id).update({ ...data, updatedAt: now });

  const updated = { id, ...doc.data(), ...data, updatedAt: now } as Record<string, unknown>;

  emitter.taskUpdated({
    taskId: id,
    projectId: updated.projectId as string,
    status: updated.status as string,
    title: updated.title as string,
    updatedAt: now,
  });

  return updated;
}
