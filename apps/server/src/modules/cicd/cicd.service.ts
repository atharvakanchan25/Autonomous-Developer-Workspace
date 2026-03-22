import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { notFound } from "../../lib/errors";
import { emitter } from "../../lib/emitter";
import type { CicdStageLog } from "../../lib/socket.events";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldPass(seed: string, failRate = 0.1): boolean {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return (hash % 100) >= failRate * 100;
}

function generatePreviewUrl(deploymentId: string): string {
  return `https://preview-${deploymentId.slice(-8)}.adw-deploy.example.com`;
}

function emit(
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

  // ── Stage 1: Tests ────────────────────────────────────────────────────────
  log.push({ stage: "tests", status: "running" });
  await prisma.deployment.update({ where: { id: deploymentId }, data: { log: JSON.stringify(log) } });
  emit(deploymentId, projectId, taskId, "RUNNING", log, { stage: "tests" });

  const testPass = shouldPass(seed + "test", 0.1);
  const testMs = 1500 + Math.floor(Math.random() * 1000);
  await sleep(testMs);

  log[0] = {
    stage: "tests", status: testPass ? "passed" : "failed", durationMs: testMs,
    detail: testPass ? "All tests passed" : "2 tests failed — assertion error in handler.test.ts",
  };
  await prisma.deployment.update({ where: { id: deploymentId }, data: { testDurationMs: testMs, log: JSON.stringify(log) } });
  emit(deploymentId, projectId, taskId, "RUNNING", log, { stage: "tests" });

  if (!testPass) {
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: "FAILED", errorMsg: log[0]!.detail } });
    emit(deploymentId, projectId, taskId, "FAILED", log, { errorMsg: log[0]!.detail });
    logger.warn("CI/CD failed at tests", { deploymentId });
    return;
  }

  // ── Stage 2: Build ────────────────────────────────────────────────────────
  log.push({ stage: "build", status: "running" });
  await prisma.deployment.update({ where: { id: deploymentId }, data: { log: JSON.stringify(log) } });
  emit(deploymentId, projectId, taskId, "RUNNING", log, { stage: "build" });

  const buildPass = shouldPass(seed + "build", 0.05);
  const buildMs = 2000 + Math.floor(Math.random() * 1500);
  await sleep(buildMs);

  log[1] = {
    stage: "build", status: buildPass ? "passed" : "failed", durationMs: buildMs,
    detail: buildPass ? "Build succeeded — 0 errors, 0 warnings" : "TypeScript error: Type 'string' is not assignable to type 'number'",
  };
  await prisma.deployment.update({ where: { id: deploymentId }, data: { buildDurationMs: buildMs, log: JSON.stringify(log) } });
  emit(deploymentId, projectId, taskId, "RUNNING", log, { stage: "build" });

  if (!buildPass) {
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: "FAILED", errorMsg: log[1]!.detail } });
    emit(deploymentId, projectId, taskId, "FAILED", log, { errorMsg: log[1]!.detail });
    logger.warn("CI/CD failed at build", { deploymentId });
    return;
  }

  // ── Stage 3: Deploy ───────────────────────────────────────────────────────
  log.push({ stage: "deploy", status: "running" });
  await prisma.deployment.update({ where: { id: deploymentId }, data: { log: JSON.stringify(log) } });
  emit(deploymentId, projectId, taskId, "RUNNING", log, { stage: "deploy" });

  const deployMs = 800 + Math.floor(Math.random() * 600);
  await sleep(deployMs);
  const previewUrl = generatePreviewUrl(deploymentId);

  log[2] = { stage: "deploy", status: "passed", durationMs: deployMs, detail: `Preview deployed to ${previewUrl}` };
  await prisma.deployment.update({ where: { id: deploymentId }, data: { status: "SUCCESS", previewUrl, log: JSON.stringify(log) } });
  emit(deploymentId, projectId, taskId, "SUCCESS", log, { previewUrl });

  logger.info("CI/CD pipeline succeeded", { deploymentId, previewUrl });
}

export async function listDeployments(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw notFound("Project");
  const rows = await prisma.deployment.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((d) => ({ ...d, log: JSON.parse(d.log) as CicdStageLog[] }));
}

export async function getDeployment(id: string) {
  const d = await prisma.deployment.findUnique({ where: { id } });
  if (!d) throw notFound("Deployment");
  return { ...d, log: JSON.parse(d.log) as CicdStageLog[] };
}
