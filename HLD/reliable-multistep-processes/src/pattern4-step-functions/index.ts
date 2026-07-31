import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProductionStepFunctionsRunner } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('================================================================');
  console.log('PRODUCTION PATTERN 4: Declarative Workflow System (AWS Step Functions)');
  console.log('================================================================');

  const jsonContent = fs.readFileSync(path.join(__dirname, 'stateMachine.json'), 'utf-8');
  const definition = JSON.parse(jsonContent);

  const runner = new ProductionStepFunctionsRunner();

  // Register Lambda Tasks
  runner.registerLambda('arn:aws:lambda:us-east-1:123456789012:function:chargePaymentLambda', async (input) => {
    console.log(`    ⚡ [Lambda:chargePayment] Charged $${input.amount} for Order ${input.orderId}`);
    return { paymentId: `pay_${input.orderId}_sfn`, status: 'CHARGED' };
  });

  runner.registerLambda('arn:aws:lambda:us-east-1:123456789012:function:reserveInventoryLambda', async (input) => {
    console.log(`    ⚡ [Lambda:reserveInventory] Reserved stock for Order ${input.orderId}`);
    return { status: 'RESERVED' };
  });

  runner.registerLambda('arn:aws:lambda:us-east-1:123456789012:function:createShippingLabelLambda', async (input) => {
    console.log(`    ⚡ [Lambda:createShippingLabel] Generated shipping carrier label`);
    return { trackingNumber: `1Z999_SFN_${input.orderId}` };
  });

  runner.registerLambda('arn:aws:lambda:us-east-1:123456789012:function:sendConfirmationEmailLambda', async (input) => {
    console.log(`    ⚡ [Lambda:sendConfirmationEmail] Email sent`);
    return { emailSent: true };
  });

  runner.registerLambda('arn:aws:lambda:us-east-1:123456789012:function:releaseInventoryLambda', async (input) => {
    console.log(`    ⚡ [Lambda:releaseInventory] Saga Compensation: Inventory released`);
    return { status: 'RELEASED' };
  });

  runner.registerLambda('arn:aws:lambda:us-east-1:123456789012:function:refundPaymentLambda', async (input) => {
    console.log(`    ⚡ [Lambda:refundPayment] Saga Compensation: Payment refunded`);
    return { status: 'REFUNDED' };
  });

  // Run 1: Happy Path Execution
  console.log('\n--- Scenario A: AWS ASL JSON State Machine Happy Path ---');
  await runner.execute(definition, { orderId: 'ORD-PROD-401', amount: 450 });

  // Run 2: Lambda Task Failure -> Catch Compensation Rollback
  console.log('\n--- Scenario B: Shipping Lambda Fails -> Catch Compensation Execution ---');
  await runner.execute(definition, { orderId: 'ORD-PROD-402', amount: 120 }, { forceFailAtArn: 'createShippingLabelLambda' });
}

main().catch(console.error);
