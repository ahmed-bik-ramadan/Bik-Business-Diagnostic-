import type { Express } from "express";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(410).json({ error: "Storage proxy is disabled." });
  });
}
