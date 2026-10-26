import { SchedulerStrategy } from "../strategies/SchedulerStrategy.js";
import { FiFoSchedulerStrategy } from "../strategies/FiFoSchedulerStrategy.js";
import { PrioritySchedulerStrategy } from "../strategies/PrioritySchedulerStrategy.js";

export enum SchedulerStrategyType {
  FIFO = "FIFO",
  PRIORITY = "PRIORITY",
}

export type SchedulerStrategyCreator = () => SchedulerStrategy;

export class SchedulerStrategyFactory {
  private static registry = new Map<string, SchedulerStrategyCreator>();

  static {
    SchedulerStrategyFactory.registerStrategy(SchedulerStrategyType.FIFO, () => new FiFoSchedulerStrategy());
    SchedulerStrategyFactory.registerStrategy(SchedulerStrategyType.PRIORITY, () => new PrioritySchedulerStrategy());
  }

  public static registerStrategy(type: string, creator: SchedulerStrategyCreator): void {
    this.registry.set(type.toUpperCase(), creator);
  }

  public static getStrategy(type: SchedulerStrategyType | string): SchedulerStrategy {
    const creator = this.registry.get(type.toUpperCase());
    if (!creator) {
      throw new Error(`Unsupported scheduler strategy type: ${type}`);
    }
    return creator();
  }
}
