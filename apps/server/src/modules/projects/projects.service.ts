import { db } from "../../lib/firestore";
import { notFound } from "../../lib/errors";
import { CreateProjectInput } from "./projects.schema";

export async function getAllProjects() {
  const snap = await db.collection("projects").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getProjectById(id: string) {
  const doc = await db.collection("projects").doc(id).get();
  if (!doc.exists) throw notFound("Project");

  const tasksSnap = await db.collection("tasks").where("projectId", "==", id).get();
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { id: doc.id, ...doc.data(), tasks };
}

export async function createProject(data: CreateProjectInput) {
  const now = new Date().toISOString();
  const ref = await db.collection("projects").add({ ...data, createdAt: now, updatedAt: now });
  return { id: ref.id, ...data, createdAt: now, updatedAt: now };
}
