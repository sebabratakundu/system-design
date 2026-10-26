# Workspace Rules

- **Package Manager**: ALWAYS use `pnpm` (never `npm` or `yarn`) for installing dependencies, running scripts, and managing Node.js/TypeScript packages.
- **Production Libraries & Real Implementations**: Do NOT use hand-rolled dummy/mock classes or fake interfaces. Always use real production packages and drivers (e.g. `ioredis`, `better-sqlite3`, `lru-cache`, etc.) for building system design patterns and implementations.

## Architectural Guides & Reference Systems

- **Insurance Management System (IMS)**:
  - Comprehensive High-Level Design (HLD) architecture specification in `HLD/insurance-management-system/insurance_management_system_hld.md`.
  - Production Database Schema & DDL in `HLD/insurance-management-system/database_schema.md`.
  - Low-Level Design (LLD), Class Diagrams, and TypeScript Reference Implementation in `LLD/insurance-management-system/` (spec in `class_diagram.md`).
  - Core domain ubiquitous language in `CONTEXT.md`.
  - Wayfinder decision tickets and resolution log in `.scratch/insurance-management-system-hld/`.
- **Job Scheduler**:
  - Low-Level Design (LLD) TypeScript implementation in `LLD/job-scheduler/` featuring Strategy pattern for scheduling (`strategies/SchedulerStrategy.ts`, `strategies/FiFoSchedulerStrategy.ts`, `strategies/PrioritySchedulerStrategy.ts`) and worker execution (`strategies/WorkerStrategy.ts`, `strategies/EmailWorkerStrategy.ts`).
  - `Job.ts` is decoupled from worker instances and holds `workerType: WorkerType | string`.
  - Factory pattern implementations in `factories/SchedulerStrategyFactory.ts` and `factories/WorkerStrategyFactory.ts` with extensible registration support.
  - Singleton pattern in `JobProcessor.ts` (`JobProcessor.getInstance()`) managing worker resolution/caching (`getWorker`, `registerWorker`) and the job execution lifecycle.

