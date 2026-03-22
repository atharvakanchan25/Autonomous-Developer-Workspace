import { Router } from "express";
import * as controller from "./ai.controller";

const router = Router();

router.post("/plan", controller.generatePlan);

export default router;
