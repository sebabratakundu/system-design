import fs from 'fs';
import path from 'path';

export interface StateMachineDefinition {
  Comment: string;
  StartAt: string;
  States: Record<string, any>;
}

export class ProductionStepFunctionsRunner {
  private lambdaRegistry = new Map<string, Function>();

  registerLambda(arnOrName: string, fn: (input: any) => Promise<any>) {
    this.lambdaRegistry.set(arnOrName, fn);
  }

  async execute(
    definition: StateMachineDefinition,
    initialInput: any,
    options?: { forceFailAtArn?: string }
  ): Promise<{ executionStatus: string; finalState: string; outputData: any }> {
    let currentStateName = definition.StartAt;
    let data = JSON.parse(JSON.stringify(initialInput));

    console.log(`\n🚀 [AWS Step Functions] Executing State Machine [${definition.Comment}] starting at [${currentStateName}]`);

    while (currentStateName) {
      const stateDef = definition.States[currentStateName];
      console.log(`  ➡️ [State Transition] Entering State: ${currentStateName} (${stateDef.Type})`);

      if (stateDef.Type === 'Fail') {
        console.log(`  ❌ [State:Fail] Terminated execution. Cause: ${stateDef.Cause}`);
        return { executionStatus: 'FAILED', finalState: currentStateName, outputData: data };
      }

      if (stateDef.Type === 'Task') {
        let attempt = 0;
        let taskSuccess = false;
        const maxAttempts = stateDef.Retry?.[0]?.MaxAttempts || 1;

        while (attempt < maxAttempts && !taskSuccess) {
          attempt++;
          try {
            if (options?.forceFailAtArn && stateDef.Resource.includes(options.forceFailAtArn)) {
              throw new Error(`[Lambda Error] Simulated error in Lambda ARN: ${stateDef.Resource}`);
            }

            const handler = this.lambdaRegistry.get(stateDef.Resource);
            if (!handler) {
              throw new Error(`Lambda ARN ${stateDef.Resource} not registered in runner`);
            }

            const result = await handler(data);
            if (stateDef.ResultPath) {
              const key = stateDef.ResultPath.replace('$.', '');
              data[key] = result;
            }

            taskSuccess = true;
          } catch (err: any) {
            console.log(`  ⚠️ [Task Attempt ${attempt}/${maxAttempts}] ${err.message}`);
            if (attempt >= maxAttempts) {
              if (stateDef.Catch && stateDef.Catch.length > 0) {
                const fallbackState = stateDef.Catch[0].Next;
                console.log(`  ↪️ [ASL Catch Block] Transitioning to compensation state: ${fallbackState}`);
                currentStateName = fallbackState;
                break;
              } else {
                return { executionStatus: 'FAILED', finalState: currentStateName, outputData: data };
              }
            }
          }
        }

        if (taskSuccess) {
          if (stateDef.End) {
            console.log(`  🏁 [State:Task] Reached Terminal End State!`);
            return { executionStatus: 'SUCCEEDED', finalState: currentStateName, outputData: data };
          }
          currentStateName = stateDef.Next;
        }
      }
    }

    return { executionStatus: 'SUCCEEDED', finalState: currentStateName, outputData: data };
  }
}
