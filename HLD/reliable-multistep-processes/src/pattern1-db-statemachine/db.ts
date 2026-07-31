import { z } from 'zod';

export const OrderStateSchema = z.enum([
  'PENDING',
  'PAYMENT_CHARGED',
  'INVENTORY_RESERVED',
  'SHIPPING_LABEL_CREATED',
  'WAITING_FOR_PICKUP',
  'FULFILLED',
  'ROLLBACK_INVENTORY',
  'ROLLBACK_PAYMENT',
  'FAILED_UNRECOVERABLE',
]);

export type OrderState = z.infer<typeof OrderStateSchema>;

export interface OrderRecord {
  id: string;
  userId: string;
  amount: number;
  items: Array<{ sku: string; qty: number }>;
  state: OrderState;
  paymentId?: string;
  shippingLabelId?: string;
  version: number;
  lockedBy?: string;
  lockedUntil?: number; // epoch ms
  createdAt: string;
  updatedAt: string;
}

export class ProductionOrderDB {
  private orders = new Map<string, OrderRecord>();

  async initSchema(): Promise<void> {
    // Simulates DDL migration run in production Postgres/MySQL
    console.log('[DB Migration] Initialized `orders` table with state, lock, and version indexes.');
  }

  async createOrder(data: { id: string; userId: string; amount: number; items: Array<{ sku: string; qty: number }> }): Promise<OrderRecord> {
    const now = new Date().toISOString();
    const record: OrderRecord = {
      ...data,
      state: 'PENDING',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(record.id, record);
    return { ...record };
  }

  async getOrder(orderId: string): Promise<OrderRecord | undefined> {
    const item = this.orders.get(orderId);
    return item ? { ...item } : undefined;
  }

  /**
   * Atomic Lock Claim (Simulates `SELECT ... FOR UPDATE SKIP LOCKED` or `UPDATE orders SET locked_by = ?, locked_until = ? WHERE id = ? AND (locked_until IS NULL OR locked_until < NOW())`)
   */
  async claimLock(orderId: string, workerId: string, lockDurationMs: number): Promise<OrderRecord | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;

    const now = Date.now();
    const isUnlocked = !order.lockedUntil || order.lockedUntil < now;
    const isSameWorker = order.lockedBy === workerId;

    if (isUnlocked || isSameWorker) {
      order.lockedBy = workerId;
      order.lockedUntil = now + lockDurationMs;
      order.updatedAt = new Date().toISOString();
      return { ...order };
    }

    return null; // Lock acquisition failed (active worker processing)
  }

  /**
   * Atomic State Transition with Optimistic Locking Version Increment
   */
  async updateState(
    orderId: string,
    expectedVersion: number,
    nextState: OrderState,
    extraData?: Partial<Pick<OrderRecord, 'paymentId' | 'shippingLabelId'>>
  ): Promise<OrderRecord> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`[DB Error] Order ${orderId} not found`);
    if (order.version !== expectedVersion) {
      throw new Error(`[DB Concurrency Conflict] Expected version ${expectedVersion} but found ${order.version}`);
    }

    order.state = nextState;
    order.version += 1;
    order.updatedAt = new Date().toISOString();
    if (extraData?.paymentId) order.paymentId = extraData.paymentId;
    if (extraData?.shippingLabelId) order.shippingLabelId = extraData.shippingLabelId;

    return { ...order };
  }

  async releaseLock(orderId: string, workerId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (order && order.lockedBy === workerId) {
      order.lockedBy = undefined;
      order.lockedUntil = undefined;
      order.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Scans for stalled orders (expired locks or pending states)
   */
  async findStuckOrders(): Promise<OrderRecord[]> {
    const now = Date.now();
    const stuck: OrderRecord[] = [];
    for (const order of this.orders.values()) {
      const isTerminal = order.state === 'FULFILLED' || order.state === 'FAILED_UNRECOVERABLE';
      const isLockExpired = !order.lockedUntil || order.lockedUntil < now;
      if (!isTerminal && isLockExpired) {
        stuck.push({ ...order });
      }
    }
    return stuck;
  }

  getAll(): OrderRecord[] {
    return Array.from(this.orders.values()).map((o) => ({ ...o }));
  }
}
