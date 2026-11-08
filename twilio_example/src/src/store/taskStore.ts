import { randomUUID } from "crypto";

export const TASK_STATUSES = ["open", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  status: TaskStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
}

export interface ListOptions {
  status?: TaskStatus;
  limit: number;
  cursor?: string;
}

export class TaskStore {
  private tasks = new Map<string, Task>();

  list(projectId: string, opts: ListOptions): { items: Task[]; nextCursor: string | null } {
    const matching = [...this.tasks.values()]
      .filter((t) => t.projectId === projectId)
      .filter((t) => !opts.status || t.status === opts.status)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const afterCursor = opts.cursor ? matching.filter((t) => t.id > opts.cursor!) : matching;
    const items = afterCursor.slice(0, opts.limit);
    const nextCursor = afterCursor.length > opts.limit ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  get(projectId: string, id: string): Task | undefined {
    const task = this.tasks.get(id);
    return task && task.projectId === projectId ? task : undefined;
  }

  create(projectId: string, input: NewTask): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: `tsk_${randomUUID()}`,
      projectId,
      title: input.title,
      description: input.description ?? null,
      assigneeId: input.assigneeId ?? null,
      status: "open",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  save(task: Task): void {
    this.tasks.set(task.id, task);
  }

  remove(projectId: string, id: string): boolean {
    if (!this.get(projectId, id)) return false;
    return this.tasks.delete(id);
  }
}
