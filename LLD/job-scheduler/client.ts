import { Job } from "./Job.js";
import { Scheduler } from "./Scheduler.js";
import {
  SchedulerStrategyFactory,
  SchedulerStrategyType,
} from "./factories/SchedulerStrategyFactory.js";
import { WorkerType } from "./strategies/WorkerStrategy.js";
import { JobProcessor } from "./JobProcessor.js";

(async () => {
  const schedulerStrategy = SchedulerStrategyFactory.getStrategy(
    SchedulerStrategyType.PRIORITY,
  );
  const scheduler = new Scheduler(schedulerStrategy);

  const job1 = new Job(
    {
      jobId: 1,
      to: "sena",
      from: "me",
      msg: "this is test",
    },
    "Me",
    WorkerType.EMAIL,
    null,
    2,
  );

  const job2 = new Job(
    {
      jobId: 2,
      to: "atri",
      from: "seba",
      msg: "this is test2",
    },
    "Me",
    WorkerType.EMAIL,
    null,
    0,
  );

  scheduler.addJob(job1);
  scheduler.addJob(job2);

  const scheduledJobs = scheduler.getScheduleJobs();
  const jobProcessor = JobProcessor.getInstance();
  await jobProcessor.process(scheduledJobs);

  console.log(scheduledJobs);
})();
