import { Worker } from "./WorkerStrategy.js";
import { Job } from "../Job.js";

export interface EmailPayload {
  jobId: number;
  to: string;
  from: string;
  msg: string;
}

export class EmailWorker extends Worker<EmailPayload> {
  execute(job: Job<EmailPayload>): void {
    const payload = job.getPayload();
    console.log(`Send Email to: ${payload.to}, from: ${payload.from}, msg: ${payload.msg}`);
  }
}
