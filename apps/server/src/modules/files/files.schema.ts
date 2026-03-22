import { z } from "zod";

export const createFileSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  path: z
    .string()
    .min(1)
    .max(500)
    .transform((p) => p.replace(/\\/g, "/")),
  name: z.string().min(1).max(255),
  language: z.string().max(50).optional().default("plaintext"),
  content: z.string().max(5_000_000).optional().default(""),
});

export const updateFileSchema = z.object({
  content: z.string().max(5_000_000),
  createVersion: z.boolean().optional().default(false),
  versionLabel: z.string().max(100).optional(),
});

export const renameFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(500)
    .transform((p) => p.replace(/\\/g, "/")),
  name: z.string().min(1).max(255),
});

export type CreateFileInput = z.infer<typeof createFileSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;
export type RenameFileInput = z.infer<typeof renameFileSchema>;
