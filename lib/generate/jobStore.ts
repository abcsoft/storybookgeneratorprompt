/**
 * In-memory job store for the POC.
 *
 * Generation takes minutes, so the API kicks off a job and the client polls for
 * progress. State lives in a process-wide singleton (kept on globalThis so it
 * survives Next.js dev hot-reloads). NOTE: this is not durable across serverless
 * cold starts — see the deployment notes in the plan for the production path.
 */

import { randomUUID } from "node:crypto";

export type JobStatus = "pending" | "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  childName: string;
  bookId: string;
  total: number;
  completed: number;
  failedPages: number;
  error?: string;
  pdf?: Buffer;
  createdAt: number;
}

type JobMap = Map<string, Job>;

const globalForJobs = globalThis as unknown as { __storybookJobs?: JobMap };
const jobs: JobMap = globalForJobs.__storybookJobs ?? new Map();
globalForJobs.__storybookJobs = jobs;

export function createJob(
  childName: string,
  bookId: string,
  total: number,
): Job {
  const job: Job = {
    id: randomUUID(),
    status: "pending",
    childName,
    bookId,
    total,
    completed: 0,
    failedPages: 0,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}
