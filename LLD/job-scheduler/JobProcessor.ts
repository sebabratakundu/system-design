import { Job } from "./Job.js";
import { Worker, WorkerType } from "./strategies/WorkerStrategy.js";
import { WorkerStrategyFactory } from "./factories/WorkerStrategyFactory.js";

export class JobProcessor {
  private static instance: JobProcessor | null = null;
  private workers: Map<string, Worker> = new Map();

  private constructor() {}

  public static getInstance(): JobProcessor {
    if (!JobProcessor.instance) {
      JobProcessor.instance = new JobProcessor();
    }
    return JobProcessor.instance;
  }

  /**
   * Pre-register or store a worker instance for a worker type before processing.
   */
  public registerWorker(workerType: WorkerType | string, worker: Worker): void {
    this.workers.set(workerType.toUpperCase(), worker);
  }

  /**
   * Retrieves an existing registered worker or creates and caches it via WorkerStrategyFactory.
   */
  public getWorker(workerType: WorkerType | string): Worker {
    const key = workerType.toUpperCase();
    let worker = this.workers.get(key);
    if (!worker) {
      worker = WorkerStrategyFactory.getWorker(key);
      this.workers.set(key, worker);
    }
    return worker;
  }

  public async processJob(job: Job): Promise<void> {
    try {
      job.updateStatus("RUNNING");
      job.increaseAttempt();
      const worker = this.getWorker(job.getWorkerType());
      await worker.execute(job);
      job.updateStatus("COMPLETED");
    } catch (error) {
      job.updateStatus("FAILED");
      console.error("Job execution failed:", error);
    }
  }

  public async process(jobs: Job[]): Promise<void> {
    for (const job of jobs) {
      await this.processJob(job);
    }
  }
}
