import { Router } from "express";
import * as controller from "./projects.controller";

const router = Router();

router.get("/", controller.getProjects);
router.get("/:id", controller.getProject);
router.post("/", controller.createProject);

export default router;
