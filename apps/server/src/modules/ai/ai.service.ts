import { prisma } from "../../lib/prisma";
import { openai } from "../../lib/openai";
import { notFound, badRequest } from "../../lib/errors";
import { SYSTEM_PROMPT, FEW_SHOT_EXAMPLE, buildUserPrompt } from "./ai.prompt";
import { aiPlanResponseSchema, GeneratePlanInput, AiTask } from "./ai.schema";

// ── LLM call ────────────────────────────────────────────────────────────────

async function callLlm(description: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,          // deterministic output
    max_tokens: 2048,
    response_format: { type: "json_object" }, // enforces JSON mode
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      // Few-shot example so the model knows exactly what shape to produce
      { role: "user", content: FEW_SHOT_EXAMPLE.input },
      { role: "assistant", content: FEW_SHOT_EXAMPLE.output },
      { role: "user", content: buildUserPrompt(description) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw badRequest("LLM returned an empty response");
  return content;
}

// ── Validation ───────────────────────────────────────────────────────────────

function parseLlmResponse(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest("LLM response was not valid JSON");
  }

  const result = aiPlanResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    throw badRequest(`LLM response failed validation: ${issues}`);
  }

  return result.data;
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistPlan(
  projectId: string,
  tasks: AiTask[],
  prompt: string,
  rawResponse: string,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Create all tasks (without dependencies first)
    const created = await Promise.all(
      tasks.map((t) =>
        tx.task.create({
          data: {
            title: t.title,
            description: t.description,
            order: t.order,
            status: "PENDING",
            projectId,
          },
        }),
      ),
    );

    // Build key → DB id map
    const keyToId = new Map<string, string>(
      tasks.map((t, i) => [t.key, created[i]!.id]),
    );

    // 2. Wire up dependencies now that all IDs exist
    await Promise.all(
      tasks
        .filter((t) => t.dependsOn.length > 0)
        .map((t) =>
          tx.task.update({
            where: { id: keyToId.get(t.key)! },
            data: {
              dependsOn: {
                connect: t.dependsOn.map((depKey) => ({ id: keyToId.get(depKey)! })),
              },
            },
          }),
        ),
    );

    // 3. Write audit log
    await tx.aiPlanLog.create({
      data: { projectId, prompt, rawResponse, taskCount: tasks.length },
    });

    // 4. Return tasks with their resolved dependencies
    return tx.task.findMany({
      where: { projectId, id: { in: created.map((t) => t.id) } },
      orderBy: { order: "asc" },
      include: { dependsOn: { select: { id: true, title: true } } },
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generatePlan(input: GeneratePlanInput) {
  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true },
  });
  if (!project) throw notFound("Project");

  const prompt = buildUserPrompt(input.description);
  const rawResponse = await callLlm(input.description);
  const { tasks } = parseLlmResponse(rawResponse);

  const savedTasks = await persistPlan(input.projectId, tasks, prompt, rawResponse);

  // Build DAG edges for the response
  const edges = tasks.flatMap((t) =>
    t.dependsOn.map((dep) => ({ from: dep, to: t.key })),
  );

  return {
    project,
    tasks: savedTasks,
    dag: {
      nodes: tasks.map((t) => ({ key: t.key, title: t.title, order: t.order })),
      edges,
    },
    meta: { taskCount: savedTasks.length },
  };
}
