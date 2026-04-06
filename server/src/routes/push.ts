import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { pushNotificationService } from "../services/push-notifications.js";

export function pushRoutes(db: Db) {
  const router = Router();
  const pushSvc = pushNotificationService(db);

  router.get("/push/vapid-key", async (_req, res) => {
    const key = await pushSvc.getVapidPublicKey();
    res.json({ vapidPublicKey: key });
  });

  router.post("/push/subscribe", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: "Invalid subscription object" });
      return;
    }
    const sub = await pushSvc.subscribe(req.actor.userId, subscription);
    res.status(201).json(sub);
  });

  router.post("/push/unsubscribe", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: "Missing endpoint" });
      return;
    }
    await pushSvc.unsubscribe(req.actor.userId, endpoint);
    res.json({ ok: true });
  });

  return router;
}
