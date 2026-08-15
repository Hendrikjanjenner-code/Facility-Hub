import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import ticketsRouter from "./tickets";
import vastgoedRouter from "./vastgoed";
import reservationsRouter from "./reservations";
import visitorsRouter from "./visitors";
import assetsRouter from "./assets";
import notificationsRouter from "./notifications";
import dashboardRouter from "./dashboard";
import contractsRouter from "./contracts";
import shopRouter from "./shop";
import sustainabilityRouter from "./sustainability";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(ticketsRouter);
router.use(vastgoedRouter);
router.use(reservationsRouter);
router.use(visitorsRouter);
router.use(assetsRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);
router.use(contractsRouter);
router.use(shopRouter);
router.use(sustainabilityRouter);

export default router;
