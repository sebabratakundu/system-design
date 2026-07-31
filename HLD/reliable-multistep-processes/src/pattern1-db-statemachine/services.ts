export class ServiceError extends Error {
  constructor(message: string, public readonly isTransient: boolean = false) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Production API Client Helper with Exponential Backoff
async function withRetry<T>(
  actionName: string,
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err: any) {
      attempt++;
      const isTransient = err instanceof ServiceError && err.isTransient;
      if (!isTransient || attempt >= maxRetries) {
        console.error(`  ❌ [${actionName}] Operation failed after ${attempt} attempt(s): ${err.message}`);
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`  ⚠️ [${actionName}] Transient error on attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

const idempotencyStore = new Map<string, any>();

export const ProductionPaymentGateway = {
  async charge(params: { idempotencyKey: string; amount: number; orderId: string }): Promise<{ id: string }> {
    return withRetry('PaymentGateway.charge', async () => {
      console.log(`  [PaymentGateway] Charging $${params.amount} | IdempotencyKey: ${params.idempotencyKey}`);

      if (idempotencyStore.has(params.idempotencyKey)) {
        console.log(`  [PaymentGateway] Idempotency Hit: Returning existing payment ID.`);
        return idempotencyStore.get(params.idempotencyKey);
      }

      const result = { id: `pay_${params.orderId}_tx_${Date.now()}` };
      idempotencyStore.set(params.idempotencyKey, result);
      return result;
    });
  },

  async refund(params: { idempotencyKey: string; paymentId: string }): Promise<void> {
    return withRetry('PaymentGateway.refund', async () => {
      console.log(`  [PaymentGateway] Refunding payment ${params.paymentId} | IdempotencyKey: ${params.idempotencyKey}`);
      idempotencyStore.set(params.idempotencyKey, { refunded: true });
    });
  },
};

export const ProductionInventoryService = {
  async reserve(params: { idempotencyKey: string; items: any[]; forceFail?: boolean }): Promise<void> {
    return withRetry('InventoryService.reserve', async () => {
      console.log(`  [InventoryService] Reserving ${params.items.length} item(s) | IdempotencyKey: ${params.idempotencyKey}`);

      if (params.forceFail) {
        throw new ServiceError('ITEM_OUT_OF_STOCK: Requested item inventory is exhausted', false /* Non-transient */);
      }

      idempotencyStore.set(params.idempotencyKey, { status: 'RESERVED' });
    });
  },

  async release(params: { idempotencyKey: string; items: any[] }): Promise<void> {
    return withRetry('InventoryService.release', async () => {
      console.log(`  [InventoryService] Releasing stock reservation | IdempotencyKey: ${params.idempotencyKey}`);
      idempotencyStore.set(params.idempotencyKey, { status: 'RELEASED' });
    });
  },
};

export const ProductionShippingAPI = {
  async createLabel(params: { idempotencyKey: string; orderId: string }): Promise<{ id: string; trackingNumber: string }> {
    return withRetry('ShippingAPI.createLabel', async () => {
      console.log(`  [ShippingAPI] Creating carrier shipping label | IdempotencyKey: ${params.idempotencyKey}`);
      const result = { id: `lbl_${params.orderId}`, trackingNumber: `1Z99999999${params.orderId}` };
      idempotencyStore.set(params.idempotencyKey, result);
      return result;
    });
  },
};
