import Database from "better-sqlite3";

/**
 * PRODUCTION-GRADE INTERFACE SEGREGATION PRINCIPLE (ISP) IMPLEMENTATION
 *
 * 🟢 ISP RULE: "Clients should not be forced to depend upon interfaces that they do not use."
 *
 * Architecture Features:
 * 1. Role-Based Interface Segregation: Breaks bloated interfaces into lean, single-role contracts
 *    (IPrinter, IScanner, IFaxMachine, IStapler, ICloudSyncable).
 * 2. Precise Component Composition: Devices implement only the exact interfaces for capabilities they support.
 * 3. Compile-Time Safety: Client services consume only narrow role interfaces (e.g. PrintService consumes IPrinter).
 * 4. Zero Unused Code / Zero Runtime Errors: No devices throw "Not Supported" or contain dummy empty methods.
 */

export interface DocumentJob {
  jobId: string;
  title: string;
  pageCount: number;
  content: string;
}

export interface PrintResult {
  success: boolean;
  pagesPrinted: number;
}

export interface ScanResult {
  success: boolean;
  scannedData: string;
}

export interface FaxResult {
  success: boolean;
  faxTxId: string;
}

// ============================================================================
// NARROW ROLE INTERFACES (Segregated Contracts)
// ============================================================================

export interface IPrinter {
  printDocument(job: DocumentJob): PrintResult;
}

export interface IScanner {
  scanDocument(job: DocumentJob): ScanResult;
}

export interface IFaxMachine {
  faxDocument(job: DocumentJob, phoneNumber: string): FaxResult;
}

export interface IStapler {
  stapleDocument(job: DocumentJob): boolean;
}

export interface ICloudSyncable {
  cloudSync(job: DocumentJob): Promise<boolean>;
}

// ============================================================================
// CONCRETE DEVICE IMPLEMENTATIONS (Segregated & Cohesive)
// ============================================================================

/**
 * 1. Basic Thermal Printer -> Implements IPrinter ONLY.
 * Zero pollution from scanning, faxing, or stapling!
 */
export class BasicThermalPrinter implements IPrinter {
  public printDocument(job: DocumentJob): PrintResult {
    console.log(
      `  [Basic Thermal Printer] Printing thermal receipt "${job.title}" (${job.pageCount} pages)...`,
    );
    return { success: true, pagesPrinted: job.pageCount };
  }
}

/**
 * 2. High-Speed Desktop Scanner -> Implements IScanner ONLY.
 */
export class HighSpeedDesktopScanner implements IScanner {
  public scanDocument(job: DocumentJob): ScanResult {
    console.log(
      `  [Desktop Scanner] High-speed OCR scanning for "${job.title}"...`,
    );
    return { success: true, scannedData: `PDF_SCAN_${job.jobId}` };
  }
}

/**
 * 3. Enterprise All-In-One Workstation -> Implements multiple role interfaces via composition.
 */
export class EnterpriseWorkstation
  implements IPrinter, IScanner, IFaxMachine, IStapler, ICloudSyncable
{
  public printDocument(job: DocumentJob): PrintResult {
    console.log(
      `  [Enterprise Workstation] Laser printing "${job.title}" (${job.pageCount} pages)...`,
    );
    return { success: true, pagesPrinted: job.pageCount };
  }

  public scanDocument(job: DocumentJob): ScanResult {
    console.log(
      `  [Enterprise Workstation] Scanning OCR copy of "${job.title}"...`,
    );
    return { success: true, scannedData: `ENTERPRISE_SCAN_${job.jobId}` };
  }

  public faxDocument(job: DocumentJob, phoneNumber: string): FaxResult {
    console.log(
      `  [Enterprise Workstation] Transmitting secure fax for "${job.title}" to ${phoneNumber}...`,
    );
    return { success: true, faxTxId: `fax_tx_${Date.now()}` };
  }

  public stapleDocument(job: DocumentJob): boolean {
    console.log(`  [Enterprise Workstation] Corner staple applied.`);
    return true;
  }

  public async cloudSync(job: DocumentJob): Promise<boolean> {
    console.log(`  [Enterprise Workstation] Encrypted backup uploaded to S3.`);
    return true;
  }
}

// ============================================================================
// CLIENT SERVICES CONSUMING NARROW ROLE INTERFACES
// ============================================================================

/**
 * Print Execution Service -> Depends strictly on IPrinter interface.
 * Can accept ANY device implementing IPrinter (BasicThermalPrinter, EnterpriseWorkstation).
 */
export class DedicatedPrintService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTable();
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS isp_print_logs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        pages INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public print(printer: IPrinter, job: DocumentJob): PrintResult {
    console.log(
      `\n[DedicatedPrintService] Submitting print job #${job.jobId} to printer...`,
    );
    const result = printer.printDocument(job);

    const logId = `${job.jobId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const stmt = this.db.prepare(
      `INSERT INTO isp_print_logs (id, title, pages) VALUES (?, ?, ?)`,
    );
    stmt.run(logId, job.title, result.pagesPrinted);

    return result;
  }
}

/**
 * Fax Transmission Service -> Depends strictly on IFaxMachine interface.
 * Compiler enforces that ONLY devices implementing IFaxMachine can be passed!
 */
export class DedicatedFaxService {
  public transmit(
    faxMachine: IFaxMachine,
    job: DocumentJob,
    phoneNumber: string,
  ): FaxResult {
    console.log(
      `\n[DedicatedFaxService] Submitting fax job #${job.jobId} to fax machine...`,
    );
    return faxMachine.faxDocument(job, phoneNumber);
  }
}
