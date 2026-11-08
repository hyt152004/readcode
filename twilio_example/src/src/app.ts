import express from "express";
import { TaskStore } from "./store/taskStore";
import { tasksRouter } from "./routes/tasks";

export function buildApp(store: TaskStore = new TaskStore()) {
  const app = express();
  app.use(express.json());
  app.use("/v1/projects/:projectId/tasks", tasksRouter(store));
  return app;
}
