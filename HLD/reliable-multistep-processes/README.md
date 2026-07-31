# Reliable Multi-Step Processes - Runnable Examples

This project contains runnable TypeScript implementations for four key architectural patterns used to solve multi-step workflows in distributed systems.

---

## Folder Structure

```
reliable-multistep-processes/
├── src/
│   ├── pattern1-db-statemachine/   # Hand-rolled DB checkpoints, locks & background poller
│   ├── pattern2-kafka-choreography/# Event-driven Kafka saga with producer/consumer offset tracking
│   ├── pattern3-temporal-durable/  # Temporal SDK style durable execution with replay history
│   └── pattern4-step-functions/    # AWS Step Functions JSON state machine & runner
```

---

## How to Run Demos

Run any pattern demo using `npm run`:

```bash
# 1. Run Pattern 1 (DB State Machine + Poller Crash Recovery)
npm run demo:pattern1

# 2. Run Pattern 2 (Kafka Event Choreography & Saga Rollbacks)
npm run demo:pattern2

# 3. Run Pattern 3 (Temporal Durable Execution, Crash Replay & Human Signals)
npm run demo:pattern3

# 4. Run Pattern 4 (AWS Step Functions ASL JSON State Machine)
npm run demo:pattern4

# Run all demos sequentially:
npm run demo:all
```
