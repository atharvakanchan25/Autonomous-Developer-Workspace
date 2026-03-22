import { z } from "zod";
import { TaskStatus } from "@prisma/client";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  projectId: z.string().cuid("Invalid project ID"),
  status: z.nativeEnum(TaskStatus).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
