import { prisma } from "../../lib/prisma";
import { notFound } from "../../lib/errors";
import { CreateProjectInput } from "./projects.schema";

export async function getAllProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tasks: true } } },
  });
}

export async function getProjectById(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { tasks: true },
  });
  if (!project) throw notFound("Project");
  return project;
}

export async function createProject(data: CreateProjectInput) {
  return prisma.project.create({ data });
}
