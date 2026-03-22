import { Router } from "express";
import * as controller from "./tasks.controller";

const router = Router();

router.get("/", controller.getTasks);
router.get("/:id", controller.getTask);
router.post("/", controller.createTask);
router.patch("/:id/status", controller.updateTaskStatus);

export default router;
