import { ISagaStep } from './ISagaStep.js';
import { SagaOrchestrator } from './SagaOrchestrator.js';
import { Quote } from '../../models/Quote.js';
import { Policy } from '../../models/Policy.js';
import { PolicyService } from '../../services/PolicyService.js';
import { BillingLedgerService, InvoiceRecord } from '../../services/BillingLedgerService.js';

export interface PolicyIssuanceContext {
  quote: Quote;
  insuredEntities: Record<string, unknown>[];
  paymentMethod: string;
  policy?: Policy;
  invoice?: InvoiceRecord;
  paymentCaptured?: boolean;
}

export class PolicyIssuanceSaga {
  private policyService: PolicyService;
  private billingService: BillingLedgerService;

  constructor(policyService: PolicyService, billingService: BillingLedgerService) {
    this.policyService = policyService;
    this.billingService = billingService;
  }

  public createOrchestrator(): SagaOrchestrator<PolicyIssuanceContext> {
    const orchestrator = new SagaOrchestrator<PolicyIssuanceContext>();

    // Step 1: Bind Quote
    orchestrator.addStep({
      stepName: 'BindQuote',
      execute: async (ctx) => {
        ctx.quote.bind();
      },
      compensate: async (_ctx) => {
        // Idempotent: No reverse needed for quote status
      },
    });

    // Step 2: Create Pending Policy Draft
    orchestrator.addStep({
      stepName: 'CreatePolicyDraft',
      execute: async (ctx) => {
        ctx.policy = this.policyService.createPolicyDraft(ctx.quote, ctx.insuredEntities);
      },
      compensate: async (ctx) => {
        if (ctx.policy) {
          ctx.policy.cancel('Cancelled due to checkout payment saga failure');
        }
      },
    });

    // Step 3: Generate Premium Invoice & Ledger Receivables
    orchestrator.addStep({
      stepName: 'GenerateInvoice',
      execute: async (ctx) => {
        if (!ctx.policy) throw new Error('Policy missing in context');
        ctx.invoice = this.billingService.generatePremiumInvoice(
          ctx.policy.id,
          ctx.quote.quotedAnnualPremiumCents
        );
      },
      compensate: async (_ctx) => {
        // Compensated via refund in Step 4 if payment occurred
      },
    });

    // Step 4: Capture Customer Payment & Ledger Cash Entry
    orchestrator.addStep({
      stepName: 'CapturePayment',
      execute: async (ctx) => {
        if (!ctx.invoice) throw new Error('Invoice missing in context');
        const idempotencyKey = `PAY-SAGA-${ctx.invoice.id}`;
        this.billingService.capturePayment({
          invoiceId: ctx.invoice.id,
          amountCents: ctx.invoice.totalAmountCents,
          paymentMethod: ctx.paymentMethod,
          idempotencyKey,
        });
        ctx.paymentCaptured = true;
      },
      compensate: async (ctx) => {
        if (ctx.paymentCaptured && ctx.policy && ctx.invoice) {
          console.log(`    [COMPENSATING LEDGER] Issuing refund of $${(ctx.invoice.totalAmountCents / 100).toFixed(2)} to customer...`);
          this.billingService.issueRefund(
            ctx.policy.id,
            ctx.invoice.totalAmountCents,
            `REFUND-SAGA-${ctx.invoice.id}`
          );
        }
      },
    });

    // Step 5: Activate Policy and Stamp Version 1
    orchestrator.addStep({
      stepName: 'ActivatePolicy',
      execute: async (ctx) => {
        if (!ctx.policy) throw new Error('Policy missing in context');
        this.policyService.activatePolicy(ctx.policy.id);
      },
      compensate: async (ctx) => {
        if (ctx.policy) {
          ctx.policy.cancel('Policy issuance saga rolled back');
        }
      },
    });

    return orchestrator;
  }
}
