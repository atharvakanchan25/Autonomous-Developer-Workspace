import { Router } from "express";
import * as ctrl from "./cicd.controller";

const router = Router();

router.post("/deploy", ctrl.triggerDeploy);
router.get("/deployments", ctrl.listDeployments);
router.get("/deployments/:id", ctrl.getDeployment);

export default router;
