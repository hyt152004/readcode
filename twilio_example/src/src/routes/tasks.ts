import { Router } from "express";
import { Task, TaskStatus, TaskStore, TASK_STATUSES } from "../store/taskStore";
import { sendProblem } from "../http/problem";

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ["open", "in_progress", "done"],
  in_progress: ["in_progress", "open", "done"],
  done: ["done"],
};

function etagFor(task: Task): string {
  return `"v${task.version}"`;
}

function collectionUrl(projectId: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}/tasks`;
}

function validateTaskBody(body: any, requireTitle: boolean): string[] {
  const errors: string[] = [];
  if (body.title === undefined) {
    if (requireTitle) errors.push("title is required");
  } else if (typeof body.title !== "string" || body.title.trim() === "") {
    errors.push("title must be a non-empty string");
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    errors.push("description must be a string or null");
  }
  if (body.assigneeId !== undefined && body.assigneeId !== null && typeof body.assigneeId !== "string") {
    errors.push("assigneeId must be a string or null");
  }
  if (body.status !== undefined && !TASK_STATUSES.includes(body.status)) {
    errors.push(`status must be one of ${TASK_STATUSES.join(", ")}`);
  }
  return errors;
}

export function tasksRouter(store: TaskStore): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !TASK_STATUSES.includes(status as TaskStatus)) {
      return sendProblem(res, 400, "Invalid status filter", `unknown status '${status}'`);
    }
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const page = store.list(projectId, { status: status as TaskStatus | undefined, limit, cursor });

    let next: string | null = null;
    if (page.nextCursor) {
      const qs = new URLSearchParams({ limit: String(limit), cursor: page.nextCursor });
      if (status) qs.set("status", status);
      next = `${collectionUrl(projectId)}?${qs.toString()}`;
    }
    res.json({ data: page.items, links: { next } });
  });

  router.post("/", (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const body = req.body ?? {};
    const errors = validateTaskBody(body, true);
    if (body.status !== undefined) errors.push("status cannot be set on create");
    if (errors.length) return sendProblem(res, 422, "Invalid task", errors.join("; "));

    const task = store.create(projectId, {
      title: body.title,
      description: body.description,
      assigneeId: body.assigneeId,
    });
    res
      .status(201)
      .location(`${collectionUrl(projectId)}/${encodeURIComponent(task.id)}`)
      .set("ETag", etagFor(task))
      .json(task);
  });

  router.get("/:taskId", (req, res) => {
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    const task = store.get(projectId, taskId);
    if (!task) return sendProblem(res, 404, "Task not found");
    const etag = etagFor(task);
    if (req.get("If-None-Match") === etag) {
      return res.status(304).set("ETag", etag).end();
    }
    res.set("ETag", etag).json(task);
  });

  router.put("/:taskId", (req, res) => {
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    const existing = store.get(projectId, taskId);
    if (!existing) return sendProblem(res, 404, "Task not found");

    const ifMatch = req.get("If-Match");
    if (!ifMatch) {
      return sendProblem(res, 428, "Precondition required", "Send If-Match with the task's current ETag");
    }
    if (ifMatch !== etagFor(existing)) {
      return sendProblem(res, 412, "Precondition failed", "Task was modified since it was read");
    }

    const body = req.body ?? {};
    const errors = validateTaskBody(body, false);
    if (errors.length) return sendProblem(res, 422, "Invalid task", errors.join("; "));

    const nextStatus: TaskStatus = body.status ?? existing.status;
    if (!ALLOWED_TRANSITIONS[existing.status].includes(nextStatus)) {
      return sendProblem(res, 409, "Invalid status transition", `${existing.status} -> ${nextStatus}`);
    }

    const updated: Task = {
      ...existing,
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      assigneeId: body.assigneeId ?? existing.assigneeId,
      status: nextStatus,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    store.save(updated);
    res.set("ETag", etagFor(updated)).json(updated);
  });

  router.delete("/:taskId", (req, res) => {
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    if (!store.remove(projectId, taskId)) return sendProblem(res, 404, "Task not found");
    res.status(204).end();
  });

  return router;
}
