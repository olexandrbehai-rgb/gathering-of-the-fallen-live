import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const renderGitCommit = process.env.RENDER_GIT_COMMIT;
  const revision =
    renderGitCommit && /^[a-f0-9]{40}$/i.test(renderGitCommit)
      ? renderGitCommit
      : null;
  const data = HealthCheckResponse.parse({ status: "ok", revision });
  res.json(data);
});

export default router;
