import { db } from "../../lib/firestore";
import { genAI } from "../../lib/gemini";
import { notFound, badRequest } from "../../lib/errors";
import { SYSTEM_PROMPT, FEW_SHOT_EXAMPLE, buildUserPrompt } from "./ai.prompt";
import { aiPlanResponseSchema, GeneratePlanInput, AiTask } from "./ai.schema";

// ── LLM call ────────────────────────────────────────────────────────────────

async function callLlm(description: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT + "\nRespond with valid JSON only, no markdown fences.",
  });

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: FEW_SHOT_EXAMPLE.input }] },
      { role: "model", parts: [{ text: FEW_SHOT_EXAMPLE.output }] },
    ],
    generationConfig: { maxOutputTokens: 2048, temperature: 0 },
  });

  const result = await chat.sendMessage(buildUserPrompt(description));
  const content = result.response.text();
  if (!content) throw badRequest("LLM returned an empty response");
  return content;
}

// ── Validation ───────────────────────────────────────────────────────────────

function parseLlmResponse(raw: string) {
  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(cleaned);
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

async function persistPlan(projectId: string, tasks: AiTask[], prompt: string, rawResponse: string) {
  const now = new Date().toISOString();
  const batch = db.batch();

  // Create task docs and collect refs
  const taskRefs = tasks.map(() => db.collection("tasks").doc());
  const keyToId = new Map<string, string>(tasks.map((t, i) => [t.key, taskRefs[i]!.id]));

  tasks.forEach((t, i) => {
    batch.set(taskRefs[i]!, {
      title: t.title,
      description: t.description,
      order: t.order,
      status: "PENDING",
      projectId,
      dependsOn: t.dependsOn.map((depKey) => keyToId.get(depKey)!),
      createdAt: now,
      updatedAt: now,
    });
  });

  // Write audit log
  const logRef = db.collection("aiPlanLogs").doc();
  batch.set(logRef, { projectId, prompt, rawResponse, taskCount: tasks.length, createdAt: now });

  await batch.commit();

  return tasks.map((t, i) => ({
    id: taskRefs[i]!.id,
    title: t.title,
    description: t.description,
    order: t.order,
    status: "PENDING",
    projectId,
    dependsOn: t.dependsOn.map((depKey) => ({ id: keyToId.get(depKey)!, title: tasks.find((x) => x.key === depKey)!.title })),
    createdAt: now,
    updatedAt: now,
  }));
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generatePlan(input: GeneratePlanInput) {
  const projectDoc = await db.collection("projects").doc(input.projectId).get();
  if (!projectDoc.exists) throw notFound("Project");
  const project = { id: projectDoc.id, ...projectDoc.data() } as { id: string; name: string };

  const prompt = buildUserPrompt(input.description);
  const rawResponse = await callLlm(input.description);
  const { tasks } = parseLlmResponse(rawResponse);

  const savedTasks = await persistPlan(input.projectId, tasks, prompt, rawResponse);

  const edges = tasks.flatMap((t) => t.dependsOn.map((dep) => ({ from: dep, to: t.key })));

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
