import { WorkerType } from "./strategies/WorkerStrategy.js";

export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export class Job<T = any> {
  private payload: T;
  private createdBy: string;
  private workerType: WorkerType | string;
  private status: JobStatus;
  private attempt: number;
  private scheduledAt: Date | null;
  private priority: number;

  constructor(
    payload: T,
    createdBy: string,
    workerType: WorkerType | string,
    scheduledAt: Date | null = null,
    priority: number = 1,
  ) {
    this.payload = payload;
    this.createdBy = createdBy;
    this.workerType = workerType;
    this.status = "PENDING";
    this.attempt = 0;
    this.scheduledAt = scheduledAt;
    this.priority = priority;
  }

  getStatus(): JobStatus {
    return this.status;
  }

  getPayload(): T {
    return this.payload;
  }

  getWorkerType(): WorkerType | string {
    return this.workerType;
  }

  getPriority(): number {
    return this.priority;
  }

  getScheduledAt(): Date | null {
    return this.scheduledAt;
  }

  getAttempt(): number {
    return this.attempt;
  }

  increaseAttempt(): void {
    this.attempt++;
  }

  updateStatus(status: JobStatus): void {
    this.status = status;
  }
}
