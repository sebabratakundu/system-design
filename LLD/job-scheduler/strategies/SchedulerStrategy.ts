import { Job } from "../Job.js";

export abstract class SchedulerStrategy {
  abstract schedule(jobs: Job[]): Job[];
}
