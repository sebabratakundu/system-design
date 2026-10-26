import { Job } from "../Job.js";

export enum WorkerType {
  EMAIL = "EMAIL",
}

export abstract class Worker<T = any> {
  abstract execute(job: Job<T>): Promise<void> | void;
}
