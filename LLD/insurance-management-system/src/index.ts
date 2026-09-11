import { DoubleEntryLedgerEngine } from './patterns/ledger/DoubleEntryLedgerEngine.js';
import { TransactionalOutbox } from './patterns/events/TransactionalOutbox.js';
import { RatingService } from './services/RatingService.js';
import { PolicyService } from './services/PolicyService.js';
import { BillingLedgerService } from './services/BillingLedgerService.js';
import { ClaimsService } from './services/ClaimsService.js';
import { PolicyIssuanceSaga } from './patterns/saga/PolicyIssuanceSaga.js';
import { Policyholder } from './models/Policyholder.js';
import { LineOfBusiness, LossCause } from './types/index.js';

async function runInsuranceSystemSimulation() {
  console.log('========================================================================');
  console.log('🏛️  INSURANCE MANAGEMENT SYSTEM (IMS) — LOW-LEVEL DESIGN (LLD) DEMO');
  console.log('========================================================================\n');

  // 1. Initialize Core Infrastructure & Engines
  const ledgerEngine = new DoubleEntryLedgerEngine();
  const outbox = new TransactionalOutbox();

  // Attach CDC subscriber logger to Outbox
  outbox.subscribe('*', (event) => {
    console.log(`  [CDC RELAY -> KAFKA] Emitted: ${event.eventType} for ${event.aggregateType} ID: ${event.aggregateId}`);
  });

  const ratingService = new RatingService();
  const policyService = new PolicyService(outbox);
  const billingService = new BillingLedgerService(ledgerEngine, outbox);
  const claimsService = new ClaimsService(policyService, billingService, outbox);
  const issuanceSaga = new PolicyIssuanceSaga(policyService, billingService);

  // 2. Create Customer Profile
  console.log('▶ STEP 1: Creating Policyholder Profile...');
  const policyholder = new Policyholder({
    firstName: 'Alex',
    lastName: 'Mercer',
    email: 'alex.mercer@example.com',
    phone: '+1-555-019-2834',
    dateOfBirth: new Date('1992-05-14'),
    riskTier: 'PREFERRED',
  });
  console.log(`  ✓ Policyholder Created: ${policyholder.fullName} (${policyholder.accountId})`);

  // 3. Dynamic Rating & Quoting
  console.log('\n▶ STEP 2: Calculating Real-Time Auto Quote with Actuarial Strategy Pipeline...');
  const quote = ratingService.calculateQuote({
    policyholder,
    lineOfBusiness: LineOfBusiness.AUTO,
    riskAttributes: {
      driverAge: 32,
      priorAccidents: 0,
      vehicleValueCents: 35000_00,
      creditTier: 'EXCELLENT',
    },
  });
  console.log(`  ✓ Generated Quote: ${quote.quoteNumber}`);
  console.log(`    - Annual Quoted Premium: $${(quote.quotedAnnualPremiumCents / 100).toFixed(2)}`);
  console.log(`    - Standard Deductible:   $${(quote.deductibleCents / 100).toFixed(2)}`);
  console.log(`    - Coverages Included:    ${quote.coverages.map((c) => c.name).join(', ')}`);

  // 4. Policy Issuance Saga Execution
  console.log('\n▶ STEP 3: Executing Distributed Policy Issuance Saga...');
  const sagaOrchestrator = issuanceSaga.createOrchestrator();
  const sagaContext = {
    quote,
    insuredEntities: [
      { type: 'VEHICLE', vin: '1HGCR2F83HA123456', make: 'Honda', model: 'Accord', year: 2022 },
    ],
    paymentMethod: 'CREDIT_CARD_VISA_4242',
  };

  const sagaResult = await sagaOrchestrator.execute(sagaContext);
  if (!sagaResult.success || !sagaContext.policy) {
    throw new Error(`Policy issuance saga failed: ${sagaResult.error?.message}`);
  }

  const policy = sagaContext.policy;
  console.log(`  ✓ Policy Successfully Activated!`);
  console.log(`    - Policy Number:    ${policy.policyNumber}`);
  console.log(`    - Current Status:   ${policy.status}`);
  console.log(`    - Version Number:   ${policy.currentVersion.versionNumber}`);
  console.log(`    - Coverage Window:  ${policy.currentVersion.validFrom.toISOString().slice(0, 10)} to ${policy.currentVersion.validTo.toISOString().slice(0, 10)}`);

  // 5. Mid-Term Adjustment (Endorsement)
  console.log('\n▶ STEP 4: Applying Mid-Term Endorsement (Adding Comprehensive Rider)...');
  const endorsementDate = new Date();
  endorsementDate.setDate(endorsementDate.getDate() + 30); // 30 days into coverage

  const newVersion = policyService.applyEndorsement({
    policyId: policy.id,
    effectiveDate: endorsementDate,
    newAnnualPremiumCents: policy.currentVersion.annualPremiumCents + 150_00,
    updatedCoverages: [
      ...policy.currentVersion.coverages,
      { code: 'ROADSIDE_ASSISTANCE', name: '24/7 Roadside Assistance', limitCents: 500_00, deductibleCents: 0, premiumCents: 150_00 },
    ],
    updatedEntities: [
      ...policy.currentVersion.insuredEntities,
      { type: 'DRIVER', name: 'Taylor Mercer', licenseNumber: 'DL-9823192', relation: 'SPOUSE' },
    ],
    endorsementReason: 'Added spouse as authorized driver and attached 24/7 roadside assistance rider.',
  });

  console.log(`  ✓ Endorsement Stamped to Policy Version ${newVersion.versionNumber}`);
  console.log(`    - Valid From:   ${newVersion.validFrom.toISOString().slice(0, 10)}`);
  console.log(`    - Total Versions Recorded on Policy: ${policy.getAllVersions().length}`);

  // 6. FNOL Claim Intake & Bi-Temporal Verification
  console.log('\n▶ STEP 5: Submitting First Notice of Loss (FNOL) Claim with Bi-Temporal Verification...');
  const dateOfLoss = new Date();
  dateOfLoss.setDate(dateOfLoss.getDate() + 45); // Accident occurred on day 45 (covered under Version 2)

  const claim = claimsService.submitFNOL({
    policyId: policy.id,
    dateOfLoss,
    lossCause: LossCause.COLLISION,
    description: 'Vehicle collided with guardrail on highway during thunderstorm.',
    incidentLocation: 'Interstate 95, Exit 42',
    initialEstimatedDamageCents: 6500_00, // $6,500 estimated damage
  });

  console.log(`  ✓ Claim Successfully Filed: ${claim.claimNumber}`);
  console.log(`    - Linked Policy Version: Version ${policy.getVersionAt(dateOfLoss)?.versionNumber}`);
  console.log(`    - Status:                ${claim.status}`);
  console.log(`    - Initial Loss Reserve:  $${(claim.totalReserveCents / 100).toFixed(2)}`);

  // 7. Adjuster Inspection & Adjudication
  console.log('\n▶ STEP 6: Adjuster Damage Inspection & Adjudication...');
  claimsService.assessClaim({
    claimId: claim.id,
    adjusterId: 'ADJ-7721',
    notes: 'Front bumper, radiator, and right headlamp assembly damaged. Approved repairs.',
    estimatedDamageCents: 6200_00,
    approvedPayoutCents: 5700_00, // $6,200 repair minus $500 deductible = $5,700 payout
    fraudRiskScore: 0.02, // Low fraud probability
  });
  console.log(`  ✓ Claim Adjudicated: Status is ${claim.status}`);
  console.log(`    - Approved Settlement: $${(claim.assessment!.approvedPayoutCents / 100).toFixed(2)} (after $500 deductible)`);

  // 8. Settlement Disbursement
  console.log('\n▶ STEP 7: Disbursing Claim Settlement Payment on Financial Ledger...');
  claimsService.settleClaim(claim.id);
  console.log(`  ✓ Claim Settled & Closed: Status is ${claim.status}`);
  console.log(`    - Disbursed Amount: $${(claim.settlementPayoutCents / 100).toFixed(2)} via Electronic Funds Transfer`);

  // 9. Relay Transactional Outbox Events
  console.log('\n▶ STEP 8: Relaying Transactional Outbox Events via CDC...');
  const relayedCount = await outbox.relayEvents();
  console.log(`  ✓ Total Events Streamed to Kafka: ${relayedCount}`);

  // 10. Financial Audit & Double-Entry Trial Balance Verification
  console.log('\n========================================================================');
  console.log('📊 DOUBLE-ENTRY GENERAL LEDGER — FINAL FINANCIAL AUDIT & TRIAL BALANCE');
  console.log('========================================================================');

  const accounts = ledgerEngine.getAllAccounts();
  console.log('\nChart of Accounts Balances:');
  console.log('------------------------------------------------------------------------');
  console.log(
    'Account Code'.padEnd(25) +
    'Account Name'.padEnd(32) +
    'Type'.padEnd(12) +
    'Balance'
  );
  console.log('------------------------------------------------------------------------');
  for (const acc of accounts) {
    console.log(
      acc.accountCode.padEnd(25) +
      acc.name.padEnd(32) +
      acc.accountType.padEnd(12) +
      `$${(acc.balanceCents / 100).toFixed(2)}`
    );
  }
  console.log('------------------------------------------------------------------------');

  const trialBalance = ledgerEngine.getTrialBalance();
  console.log(`\nTrial Balance Check:`);
  console.log(`  Total Debits:  $${(trialBalance.totalDebitsCents / 100).toFixed(2)}`);
  console.log(`  Total Credits: $${(trialBalance.totalCreditsCents / 100).toFixed(2)}`);
  console.log(`  Invariant:     ${trialBalance.isBalanced ? '✅ BALANCED (Zero Discrepancy)' : '❌ IMBALANCED'}`);
  console.log('========================================================================\n');
}

runInsuranceSystemSimulation().catch((err) => {
  console.error('Fatal Simulation Error:', err);
  process.exit(1);
});
