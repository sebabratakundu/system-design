import { ISagaStep } from './ISagaStep.js';

export class SagaOrchestrator<TContext> {
  private steps: ISagaStep<TContext>[] = [];

  public addStep(step: ISagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  public async execute(context: TContext): Promise<{ success: boolean; error?: Error; executedSteps: string[] }> {
    const executedSteps: ISagaStep<TContext>[] = [];

    for (const step of this.steps) {
      try {
        console.log(`  [SAGA] Executing step: ${step.stepName}...`);
        await step.execute(context);
        executedSteps.push(step);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`  [SAGA ERROR] Step '${step.stepName}' failed: ${error.message}`);
        console.log(`  [SAGA] Triggering compensating transactions in reverse order...`);

        // Compensate previously executed steps in LIFO order
        for (let i = executedSteps.length - 1; i >= 0; i--) {
          const compStep = executedSteps[i]!;
          try {
            console.log(`  [SAGA COMPENSATION] Compensating: ${compStep.stepName}...`);
            await compStep.compensate(context);
          } catch (compErr) {
            console.error(`  [CRITICAL] Compensation failed for ${compStep.stepName}:`, compErr);
          }
        }

        return {
          success: false,
          error,
          executedSteps: executedSteps.map((s) => s.stepName),
        };
      }
    }

    return {
      success: true,
      executedSteps: executedSteps.map((s) => s.stepName),
    };
  }
}
