import { Job } from "./Job.js";
import { SchedulerStrategy } from "./strategies/SchedulerStrategy.js";

export class Scheduler {
  private jobs: Job[] = [];
  private schedulerStrategy: SchedulerStrategy;

  constructor(schedulerStrategy: SchedulerStrategy) {
    this.schedulerStrategy = schedulerStrategy;
  }

  addJob(job: Job): void {
    this.jobs.push(job);
  }

  getAvailableJobs(): Job[] {
    const now = new Date();
    return this.jobs.filter((job) => {
      const isPending = job.getStatus() === "PENDING";
      const scheduledAt = job.getScheduledAt();
      const isDue = !scheduledAt || scheduledAt <= now;
      return isPending && isDue;
    });
  }

  getScheduleJobs(): Job[] {
    const availableJobs = this.getAvailableJobs();
    return this.schedulerStrategy.schedule(availableJobs);
  }
}
