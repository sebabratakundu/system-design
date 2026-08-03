import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  DocumentWorkflowServiceAntiPattern,
  EnterpriseAllInOneWorkstation as AntiPatternWorkstation,
  BasicThermalPrinter as AntiPatternPrinter,
  DocumentJob,
} from './0-anti-pattern-fat-interface.js';
import {
  DedicatedPrintService,
  DedicatedFaxService,
  BasicThermalPrinter,
  HighSpeedDesktopScanner,
  EnterpriseWorkstation,
} from './1-production-isp.js';

const DB_PATH_MONOLITHIC = path.join(process.cwd(), 'monolithic_isp_demo.db');
const DB_PATH_ISP = path.join(process.cwd(), 'production_isp_demo.db');

function cleanupDatabases() {
  for (const f of [DB_PATH_MONOLITHIC, DB_PATH_ISP]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

async function runInterfaceSegregationPrincipleDemo() {
  cleanupDatabases();

  console.log('\n===============================================================');
  console.log('🚀 INTERFACE SEGREGATION PRINCIPLE (ISP) DEMONSTRATION');
  console.log('===============================================================\n');

  const sampleJob: DocumentJob = {
    jobId: 'job_8801',
    title: 'Q3 Financial Audit Summary',
    pageCount: 12,
    content: 'CONFIDENTIAL FINANCIAL AUDIT CONTENT',
  };

  // -----------------------------------------------------------------
  // SECTION 1: FAT INTERFACE ANTI-PATTERN (ISP VIOLATION)
  // -----------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log('🔴 SECTION 1: BLOATED FAT INTERFACE (ISP VIOLATION)');
  console.log('---------------------------------------------------------------');

  const antiPatternService = new DocumentWorkflowServiceAntiPattern(DB_PATH_MONOLITHIC);
  const enterpriseDevice = new AntiPatternWorkstation();
  const basicPrinter = new AntiPatternPrinter();

  console.log('Executing print job on Basic Thermal Printer (Works)...');
  antiPatternService.executePrintJob(basicPrinter, sampleJob);

  console.log('\n⚡ Executing Archival Workflow (Print + Scan + Fax) on Basic Thermal Printer...');
  try {
    antiPatternService.executeFullArchivalJob(basicPrinter, sampleJob, '+1-555-0199');
  } catch (err: any) {
    console.log(`  ❌ CRASHED: ${err.message}`);
    console.log('  💡 WHY: BasicThermalPrinter was forced by IMultiFunctionSmartDevice interface to expose scanDocument/faxDocument!');
  }

  antiPatternService.close();

  // -----------------------------------------------------------------
  // SECTION 2: PRODUCTION ISP ARCHITECTURE (ROLE-BASED SEGREGATION)
  // -----------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('🟢 SECTION 2: PRODUCTION ISP ARCHITECTURE (ROLE INTERFACES)');
  console.log('---------------------------------------------------------------');

  const ispDb = new Database(DB_PATH_ISP);
  const printService = new DedicatedPrintService(ispDb);
  const faxService = new DedicatedFaxService();

  const prodBasicPrinter = new BasicThermalPrinter();
  const prodWorkstation = new EnterpriseWorkstation();

  // Print Service accepts ANY IPrinter (BasicThermalPrinter or EnterpriseWorkstation)
  console.log('1. DedicatedPrintService consuming BasicThermalPrinter (IPrinter):');
  printService.print(prodBasicPrinter, sampleJob);

  console.log('\n2. DedicatedPrintService consuming EnterpriseWorkstation (IPrinter):');
  printService.print(prodWorkstation, sampleJob);

  console.log('\n3. DedicatedFaxService consuming EnterpriseWorkstation (IFaxMachine):');
  faxService.transmit(prodWorkstation, sampleJob, '+1-555-0199');

  console.log('\n💡 COMPILE-TIME SAFETY NOTE:');
  console.log('  The TypeScript compiler PREVENTS passing `prodBasicPrinter` to `faxService.transmit()`');
  console.log('  because `BasicThermalPrinter` does NOT implement `IFaxMachine`. Zero runtime crashes possible!');

  ispDb.close();

  // -----------------------------------------------------------------
  // ARCHITECTURAL COMPARISON SUMMARY
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 ARCHITECTURAL COMPARISON TABLE');
  console.log('===============================================================');

  console.table([
    {
      Metric: 'Interface Size & Focus',
      'Fat Interface Anti-Pattern': 'Bloated (15 methods forced on all devices)',
      'Production ISP Architecture': 'Lean (Single-role interfaces: IPrinter, IFaxMachine)',
    },
    {
      Metric: 'Unused Method Burden',
      'Fat Interface Anti-Pattern': 'High (Simple printers forced to throw errors)',
      'Production ISP Architecture': 'Zero (Classes implement only what they support)',
    },
    {
      Metric: 'Compile-Time Safety',
      'Fat Interface Anti-Pattern': 'Low (Invalid method calls crash at runtime)',
      'Production ISP Architecture': 'High (Compiler blocks invalid calls at build time)',
    },
    {
      Metric: 'Re-compilation Cascade',
      'Fat Interface Anti-Pattern': 'High (Changing fax signature re-compiles printer)',
      'Production ISP Architecture': 'Zero (Changes to IFaxMachine do not touch IPrinter)',
    },
    {
      Metric: 'Client Coupling',
      'Fat Interface Anti-Pattern': 'Tight (Clients depend on full monolith interface)',
      'Production ISP Architecture': 'Loose (Clients depend strictly on narrow role contracts)',
    },
  ]);

  cleanupDatabases();
}

runInterfaceSegregationPrincipleDemo().catch((err) => {
  console.error('❌ Error executing ISP demo:', err);
  process.exit(1);
});
