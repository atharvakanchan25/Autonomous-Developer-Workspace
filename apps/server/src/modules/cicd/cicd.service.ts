import { db } from "../../lib/firestore";
import { logger } from "../../lib/logger";
import { notFound } from "../../lib/errors";
import { emitter } from "../../lib/emitter";
import type { CicdStageLog } from "../../lib/socket.events";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function deterministicPass(seed: string, failRate: number): boolean {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return (hash % 100) >= failRate * 100;
}

function generatePreviewUrl(deploymentId: string): string {
  return `https://preview-${deploymentId.slice(-8)}.adw-deploy.example.com`;
}

function emitUpdate(
  deploymentId: string,
  projectId: string,
  taskId: string | null,
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED",
  log: CicdStageLog[],
  extra: { stage?: string; previewUrl?: string; errorMsg?: string } = {},
) {
  emitter.deploymentUpdated({ deploymentId, projectId, taskId, status, log, updatedAt: new Date().toISOString(), ...extra });
}

interface StageConfig {
  name: string;
  failRate: number;
  minMs: number;
  maxMs: number;
  passDetail: string;
  failDetail: string;
  dbField?: "testDurationMs" | "buildDurationMs";
}

const STAGES: StageConfig[] = [
  { name: "tests", failRate: 0.1, minMs: 1500, maxMs: 2500, passDetail: "All tests passed", failDetail: "2 tests failed — assertion error in handler.test.ts", dbField: "testDurationMs" },
  { name: "build", failRate: 0.05, minMs: 2000, maxMs: 3500, passDetail: "Build succeeded — 0 errors, 0 warnings", failDetail: "TypeScript error: Type 'string' is not assignable to type 'number'", dbField: "buildDurationMs" },
  { name: "deploy", failRate: 0, minMs: 800, maxMs: 1400, passDetail: "", failDetail: "" },
];

export async function runCicdPipeline(projectId: string, taskId: string | null): Promise<void> {
  const projectDoc = await db.collection("projects").doc(projectId).get();
  if (!projectDoc.exists) throw notFound("Project");

  const seed = `${projectId}${taskId ?? ""}`;
  const now = new Date().toISOString();
  const deployRef = await db.collection("deployments").add({
    projectId, taskId, status: "RUNNING", log: [], createdAt: now, updatedAt: now,
  });
  const deploymentId = deployRef.id;
  const log: CicdStageLog[] = [];

  logger.info("CI/CD pipeline started", { deploymentId, projectId, taskId });

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i]!;
    const durationMs = stage.minMs + Math.floor(Math.random() * (stage.maxMs - stage.minMs));

    log[i] = { stage: stage.name, status: "running" };
    await deployRef.update({ log, updatedAt: new Date().toISOString() });
    emitUpdate(deploymentId, projectId, taskId, "RUNNING", log, { stage: stage.name });

    await sleep(durationMs);

    const passed = deterministicPass(seed + stage.name, stage.failRate);

    if (stage.name === "deploy") {
      const previewUrl = generatePreviewUrl(deploymentId);
      log[i] = { stage: stage.name, status: "passed", durationMs, detail: `Preview deployed to ${previewUrl}` };
      await deployRef.update({ status: "SUCCESS", previewUrl, log, updatedAt: new Date().toISOString() });
      emitUpdate(deploymentId, projectId, taskId, "SUCCESS", log, { previewUrl });
      logger.info("CI/CD pipeline succeeded", { deploymentId, previewUrl });
      return;
    }

    log[i] = { stage: stage.name, status: passed ? "passed" : "failed", durationMs, detail: passed ? stage.passDetail : stage.failDetail };
    const update: Record<string, unknown> = { log, updatedAt: new Date().toISOString() };
    if (stage.dbField) update[stage.dbField] = durationMs;
    await deployRef.update(update);

    if (!passed) {
      await deployRef.update({ status: "FAILED", errorMsg: log[i]!.detail, updatedAt: new Date().toISOString() });
      emitUpdate(deploymentId, projectId, taskId, "FAILED", log, { errorMsg: log[i]!.detail });
      logger.warn(`CI/CD failed at ${stage.name}`, { deploymentId });
      return;
    }

    emitUpdate(deploymentId, projectId, taskId, "RUNNING", log, { stage: stage.name });
  }
}

export async function listDeployments(projectId: string) {
  const projectDoc = await db.collection("projects").doc(projectId).get();
  if (!projectDoc.exists) throw notFound("Project");

  const snap = await db.collection("deployments")
    .where("projectId", "==", projectId)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDeployment(id: string) {
  const doc = await db.collection("deployments").doc(id).get();
  if (!doc.exists) throw notFound("Deployment");
  return { id: doc.id, ...doc.data() };
}
