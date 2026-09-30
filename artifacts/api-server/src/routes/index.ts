import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gatheringRouter from "./gathering";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gatheringRouter);

export default router;
