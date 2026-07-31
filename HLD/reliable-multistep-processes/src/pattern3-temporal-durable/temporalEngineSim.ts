import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { Client } from "@temporalio/client";
import { productionActivities } from "./activities.js";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TemporalRunner {
  private testEnv?: TestWorkflowEnvironment;
  public client!: Client;
  private worker?: Worker;
  private workerRunPromise?: Promise<void>;

  async start(): Promise<void> {
    try {
      // Create in-process Temporal environment for out-of-the-box local execution
      this.testEnv = await TestWorkflowEnvironment.createLocal();
      this.client = this.testEnv.client;

      const workflowsPath = path.resolve(__dirname, "./workflow.ts");

      this.worker = await Worker.create({
        connection: this.testEnv.nativeConnection,
        namespace: "default",
        taskQueue: "order-fulfillment-queue",
        workflowsPath,
        activities: productionActivities,
      });

      // Run worker background loop
      this.workerRunPromise = this.worker.run();
      console.log(
        "🔌 [Temporal Worker] Connected to Temporal engine on task queue [order-fulfillment-queue]",
      );
    } catch (err: any) {
      console.warn("⚠️ Could not start TestWorkflowEnvironment:", err.message);
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      this.worker.shutdown();
      if (this.workerRunPromise) {
        await this.workerRunPromise.catch(() => {});
      }
    }
    if (this.testEnv) {
      await this.testEnv.teardown();
    }
  }
}
