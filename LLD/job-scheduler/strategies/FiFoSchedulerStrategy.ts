import { SchedulerStrategy } from "./SchedulerStrategy.js";
import { Job } from "../Job.js";

export class FiFoSchedulerStrategy extends SchedulerStrategy {
  schedule(jobs: Job[]): Job[] {
    return [...jobs];
  }
}
