import Database from 'better-sqlite3';

/**
 * ISP ANTI-PATTERN: The "Fat / Bloated Interface" (IMultiFunctionSmartDevice)
 * 
 * 🔴 WHY THIS VIOLATES THE INTERFACE SEGREGATION PRINCIPLE (ISP):
 * 1. FORCED UNUSED IMPLEMENTATIONS: BasicOfficePrinter only prints, but is FORCED to implement
 *    scanDocument, faxDocument, stapleDocument, and cloudSync.
 * 2. RUNTIME EXCEPTIONS & POLLUTION: Unsupported methods are forced to throw runtime errors
 *    or contain empty dummy code ({}), polluting the class API.
 * 3. COUPLING & RE-COMPILATION: If the faxDocument method signature changes, BasicOfficePrinter
 *    is forced to re-compile and re-deploy even though it never uses faxing!
 */

export interface DocumentJob {
  jobId: string;
  title: string;
  pageCount: number;
  content: string;
}

/**
 * 🔴 FAT INTERFACE: Forces all devices to support printing, scanning, faxing, stapling, and cloud sync!
 */
export interface IMultiFunctionSmartDevice {
  printDocument(job: DocumentJob): { success: boolean; pagesPrinted: number };
  scanDocument(job: DocumentJob): { success: boolean; scannedData: string };
  faxDocument(job: DocumentJob, phoneNumber: string): { success: boolean; faxTxId: string };
  stapleDocument(job: DocumentJob): { success: boolean };
  cloudSync(job: DocumentJob): { success: boolean };
}

/**
 * High-End Workstation (Supports all features)
 */
export class EnterpriseAllInOneWorkstation implements IMultiFunctionSmartDevice {
  public printDocument(job: DocumentJob) {
    console.log(`  [Enterprise Workstation] Printing document "${job.title}" (${job.pageCount} pages)...`);
    return { success: true, pagesPrinted: job.pageCount };
  }

  public scanDocument(job: DocumentJob) {
    console.log(`  [Enterprise Workstation] Scanning OCR document "${job.title}"...`);
    return { success: true, scannedData: `OCR_DATA_${job.jobId}` };
  }

  public faxDocument(job: DocumentJob, phoneNumber: string) {
    console.log(`  [Enterprise Workstation] Faxing "${job.title}" to ${phoneNumber}...`);
    return { success: true, faxTxId: `fax_${Date.now()}` };
  }

  public stapleDocument(job: DocumentJob) {
    console.log(`  [Enterprise Workstation] Mechanical stapling applied to ${job.pageCount} pages.`);
    return { success: true };
  }

  public cloudSync(job: DocumentJob) {
    console.log(`  [Enterprise Workstation] Uploading PDF copy to S3 Cloud Storage...`);
    return { success: true };
  }
}

/**
 * 🔴 BASIC PRINTER: Forced to implement methods it does NOT support!
 */
export class BasicThermalPrinter implements IMultiFunctionSmartDevice {
  public printDocument(job: DocumentJob) {
    console.log(`  [Basic Thermal Printer] Printing receipt "${job.title}"...`);
    return { success: true, pagesPrinted: job.pageCount };
  }

  // 💥 FORCED DUMMY / EXCEPTION METHODS
  public scanDocument(job: DocumentJob): { success: boolean; scannedData: string } {
    throw new Error('[ISP Violation] Basic Thermal Printer DOES NOT support scanning!');
  }

  public faxDocument(job: DocumentJob, phoneNumber: string): { success: boolean; faxTxId: string } {
    throw new Error('[ISP Violation] Basic Thermal Printer DOES NOT support faxing!');
  }

  public stapleDocument(job: DocumentJob): { success: boolean } {
    throw new Error('[ISP Violation] Basic Thermal Printer DOES NOT support stapling!');
  }

  public cloudSync(job: DocumentJob): { success: boolean } {
    throw new Error('[ISP Violation] Basic Thermal Printer DOES NOT support cloud sync!');
  }
}

/**
 * Client Service expecting fat IMultiFunctionSmartDevice interface
 */
export class DocumentWorkflowServiceAntiPattern {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monolithic_jobs (
        id TEXT PRIMARY KEY,
        device TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public executePrintJob(device: IMultiFunctionSmartDevice, job: DocumentJob) {
    console.log(`\n[Workflow Service] Executing PRINT workflow for job #${job.jobId}...`);
    const res = device.printDocument(job);
    const stmt = this.db.prepare(`INSERT INTO monolithic_jobs (id, device, action) VALUES (?, ?, ?)`);
    stmt.run(job.jobId, 'SmartDevice', 'PRINT');
    return res;
  }

  /**
   * 💥 RUNTIME RISK: If passed a BasicThermalPrinter, this method will CRASH because
   * the interface forced BasicThermalPrinter to expose faxDocument!
   */
  public executeFullArchivalJob(device: IMultiFunctionSmartDevice, job: DocumentJob, faxNumber: string) {
    console.log(`\n[Workflow Service] Executing FULL ARCHIVAL workflow for job #${job.jobId}...`);
    device.printDocument(job);
    device.scanDocument(job); // 💥 Crashes if BasicThermalPrinter!
    device.faxDocument(job, faxNumber);
  }

  public close() {
    this.db.close();
  }
}
