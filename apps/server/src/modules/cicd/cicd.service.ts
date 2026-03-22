import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { notFound } from "../../lib/errors";
import { emitter } from "../../lib/emitter";
import type { CicdStageLog } from "../../lib/socket.events";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  emitter.deploymentUpdated({
    deploymentId, projectId, taskId, status, log,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
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
  {
    name: "tests",
    failRate: 0.1,
    minMs: 1500,
    maxMs: 2500,
    passDetail: "All tests passed",
    failDetail: "2 tests failed — assertion error in handler.test.ts",
    dbField: "testDurationMs",
  },
  {
    name: "build",
    failRate: 0.05,
    minMs: 2000,
    maxMs: 3500,
    passDetail: "Build succeeded — 0 errors, 0 warnings",
    failDetail: "TypeScript error: Type 'string' is not assignable to type 'number'",
    dbField: "buildDurationMs",
  },
  {
    name: "deploy",
    failRate: 0,
    minMs: 800,
    maxMs: 1400,
    passDetail: "", // set dynamically
    failDetail: "",
  },
];

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runCicdPipeline(projectId: string, taskId: string | null): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw notFound("Project");

  const seed = `${projectId}${taskId ?? ""}`;
  const deployment = await prisma.deployment.create({
    data: { projectId, taskId, status: "RUNNING", log: "[]" },
  });
  const { id: deploymentId } = deployment;
  const log: CicdStageLog[] = [];

  logger.info("CI/CD pipeline started", { deploymentId, projectId, taskId });

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i]!;
    const durationMs = stage.minMs + Math.floor(Math.random() * (stage.maxMs - stage.minMs));

    // Mark stage as running
    log[i] = { stage: stage.name, status: "running" };
    await prisma.deployment.update({ where: { id: deploymentId }, data: { log: JSON.stringify(log) } });
    emitUpdate(deploymentId, projectId, taskId, "RUNNING", log, { stage: stage.name });

    await sleep(durationMs);

    const passed = deterministicPass(seed + stage.name, stage.failRate);

    if (stage.name === "deploy") {
      const previewUrl = generatePreviewUrl(deploymentId);
      log[i] = { stage: stage.name, status: "passed", durationMs, detail: `Preview deployed to ${previewUrl}` };
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "SUCCESS", previewUrl, log: JSON.stringify(log) },
      });
      emitUpdate(deploymentId, projectId, taskId, "SUCCESS", log, { previewUrl });
      logger.info("CI/CD pipeline succeeded", { deploymentId, previewUrl });
      return;
    }

    log[i] = {
      stage: stage.name,
      status: passed ? "passed" : "failed",
      durationMs,
      detail: passed ? stage.passDetail : stage.failDetail,
    };

    const dbUpdate: Record<string, unknown> = { log: JSON.stringify(log) };
    if (stage.dbField) dbUpdate[stage.dbField] = durationMs;
    await prisma.deployment.update({ where: { id: deploymentId }, data: dbUpdate });

    if (!passed) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "FAILED", errorMsg: log[i]!.detail },
      });
      emitUpdate(deploymentId, projectId, taskId, "FAILED", log, { errorMsg: log[i]!.detail });
      logger.warn(`CI/CD failed at ${stage.name}`, { deploymentId });
      return;
    }

    emitUpdate(deploymentId, projectId, taskId, "RUNNING", log, { stage: stage.name });
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listDeployments(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw notFound("Project");

  const rows = await prisma.deployment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((d) => ({ ...d, log: JSON.parse(d.log) as CicdStageLog[] }));
}

export async function getDeployment(id: string) {
  const d = await prisma.deployment.findUnique({ where: { id } });
  if (!d) throw notFound("Deployment");
  return { ...d, log: JSON.parse(d.log) as CicdStageLog[] };
}
