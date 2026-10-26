import { Worker, WorkerType } from "../strategies/WorkerStrategy.js";
import { EmailWorker } from "../strategies/EmailWorkerStrategy.js";

export { WorkerType };

export type WorkerCreator<T = any> = () => Worker<T>;

export class WorkerStrategyFactory {
  private static registry = new Map<string, WorkerCreator>();

  static {
    WorkerStrategyFactory.registerWorker(WorkerType.EMAIL, () => new EmailWorker());
  }

  public static registerWorker<T = any>(type: string, creator: WorkerCreator<T>): void {
    this.registry.set(type.toUpperCase(), creator);
  }

  public static getWorker<T = any>(type: WorkerType | string): Worker<T> {
    const creator = this.registry.get(type.toUpperCase());
    if (!creator) {
      throw new Error(`Unsupported worker strategy type: ${type}`);
    }
    return creator() as Worker<T>;
  }
}
