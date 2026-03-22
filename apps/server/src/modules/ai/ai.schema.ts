import { z } from "zod";

// Shape of each task inside the LLM response
export const aiTaskSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "key must be lowercase snake_case"),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  order: z.number().int().positive(),
  dependsOn: z.array(z.string()),
});

// Full LLM response envelope
export const aiPlanResponseSchema = z
  .object({
    tasks: z.array(aiTaskSchema).min(1).max(12),
  })
  .superRefine((data, ctx) => {
    const keys = new Set(data.tasks.map((t) => t.key));

    // All keys must be unique
    if (keys.size !== data.tasks.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Task keys must be unique" });
    }

    // dependsOn must only reference known keys
    for (const task of data.tasks) {
      for (const dep of task.dependsOn) {
        if (!keys.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Task "${task.key}" depends on unknown key "${dep}"`,
          });
        }
        if (dep === task.key) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Task "${task.key}" cannot depend on itself`,
          });
        }
      }
    }

    // Cycle detection via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjMap = new Map<string, string[]>(data.tasks.map((t) => [t.key, t.dependsOn]));

    function hasCycle(key: string): boolean {
      if (inStack.has(key)) return true;
      if (visited.has(key)) return false;
      visited.add(key);
      inStack.add(key);
      for (const dep of adjMap.get(key) ?? []) {
        if (hasCycle(dep)) return true;
      }
      inStack.delete(key);
      return false;
    }

    for (const key of keys) {
      if (hasCycle(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Dependency graph contains a cycle",
        });
        break;
      }
    }
  });

// Incoming HTTP request body
export const generatePlanSchema = z.object({
  projectId: z.string().cuid("Invalid project ID"),
  description: z.string().min(10, "Description must be at least 10 characters").max(2000),
});

export type AiTask = z.infer<typeof aiTaskSchema>;
export type AiPlanResponse = z.infer<typeof aiPlanResponseSchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;
