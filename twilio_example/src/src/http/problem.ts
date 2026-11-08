import { Response } from "express";

export function sendProblem(res: Response, status: number, title: string, detail?: string): void {
  res
    .status(status)
    .type("application/problem+json")
    .json({ type: "about:blank", title, status, detail });
}
