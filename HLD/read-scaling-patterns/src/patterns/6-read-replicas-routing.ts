import { db } from '../db/database.js';

/**
 * PATTERN 6: Horizontal DB Scaling — Read Replicas & Replication Lag Solution
 * 
 * Demonstrates:
 *  1. Leader-Follower Read Replica Router.
 *  2. Replication Lag Dilemma ("Read-Your-Own-Writes" stale data bug).
 *  3. GTID Watermark / Session-Sticky Leader Routing solution.
 */

export class ReadReplicaCluster {
  private leaderGtid = 100;
  private replicaGtid = 95; // Replica is lagging behind by 5 GTID transactions

  // Write operation goes exclusively to Primary Leader
  async writeToLeader(uuid: string, newBio: string): Promise<{ gtid: number }> {
    this.leaderGtid++;
    db.prepare('UPDATE users SET bio = ?, version = version + 1 WHERE uuid = ?').run(newBio, uuid);
    return { gtid: this.leaderGtid };
  }

  // Simulate replica lag background sync
  async syncReplicaToGtid(targetGtid: number) {
    this.replicaGtid = targetGtid;
  }

  // Naive Read: Always hits Replica (Vulnerable to Replication Lag stale reads)
  async readNaiveReplica(uuid: string): Promise<{ data: any; servedBy: string; gtid: number }> {
    const data = db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
    return { data, servedBy: 'REPLICA_NODE_1', gtid: this.replicaGtid };
  }

  // Smart Read Router: Checks GTID watermark to ensure Read-Your-Own-Writes Consistency
  async readSmartRouter(uuid: string, sessionMinGtid?: number): Promise<{ data: any; servedBy: string; gtid: number }> {
    if (sessionMinGtid && this.replicaGtid < sessionMinGtid) {
      // Replica is lagging behind user's write; route read request to Primary Leader
      const data = db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
      return { data, servedBy: 'PRIMARY_LEADER_NODE (Lag Fallback)', gtid: this.leaderGtid };
    }

    // Replica is caught up; safe to serve from Replica node
    const data = db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
    return { data, servedBy: 'REPLICA_NODE_1', gtid: this.replicaGtid };
  }

  public getStatus() {
    return {
      leaderGtid: this.leaderGtid,
      replicaGtid: this.replicaGtid,
      lagDelta: this.leaderGtid - this.replicaGtid
    };
  }
}
