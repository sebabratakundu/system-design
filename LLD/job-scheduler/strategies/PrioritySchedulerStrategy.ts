import { SchedulerStrategy } from "./SchedulerStrategy.js";
import { Job } from "../Job.js";

export class PrioritySchedulerStrategy extends SchedulerStrategy {
  schedule(jobs: Job[]): Job[] {
    return [...jobs].sort((job1, job2) => job1.getPriority() - job2.getPriority());
  }
}
