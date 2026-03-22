import { Router } from "express";
import * as ctrl from "./files.controller";

const router = Router();

// GET    /api/files?projectId=xxx   — list files (metadata only, no content)
// POST   /api/files                 — create file
// GET    /api/files/:id             — get file with content
// PATCH  /api/files/:id             — save content
// PATCH  /api/files/:id/rename      — rename / move
// DELETE /api/files/:id             — delete
// GET    /api/files/:id/versions    — list version history
// GET    /api/files/:id/versions/:versionId — get version content
// POST   /api/files/:id/versions/:versionId/restore — restore version

router.get("/", ctrl.listFiles);
router.post("/", ctrl.createFile);
router.get("/:id", ctrl.getFile);
router.patch("/:id", ctrl.updateFile);
router.patch("/:id/rename", ctrl.renameFile);
router.delete("/:id", ctrl.deleteFile);
router.get("/:id/versions", ctrl.listVersions);
router.get("/:id/versions/:versionId", ctrl.getVersion);
router.post("/:id/versions/:versionId/restore", ctrl.restoreVersion);

export default router;
