import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import shareRouter from "./share";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/share", shareRouter);
router.use(eventsRouter);

export default router;
