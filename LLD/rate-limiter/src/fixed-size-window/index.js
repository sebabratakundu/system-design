import { client } from "../redis-client.js";

const WINDOW_SIZE = 10;
const PERIOD = 1;

class FixedWindowRateLimitter {
  constructor(capacity, period) {
    this.capacity = capacity;
    this.period = period; // seconds
    this.FIXED_WINDOW_SCRIPT = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
    end
    return current
    `;
    this.scriptSHA = null;
    this.scriptLoaded = false;
  }

  async loadScript() {
    try {
      this.scriptSHA = await client.scriptLoad(this.FIXED_WINDOW_SCRIPT);
      this.scriptLoaded = true;
    } catch (error) {
      console.error("cant find script in cache: ", error);
    }
  }

  async allow(key) {
    await this.loadScript();

    let current;
    try {
      current = await client.evalSha(this.scriptSHA, {
        keys: [key],
        arguments: [String(this.period)],
      });
    } catch (error) {
      if (error.message && error.message.includes("NOSCRIPT")) {
        current = await client.eval(this.FIXED_WINDOW_SCRIPT, {
          keys: [key],
          arguments: [String(this.period)],
        });

        this.scriptLoaded = false;
      } else {
        throw error;
      }
    }

    if (current > this.capacity) {
      return false;
    }

    console.log("current req:", current, "remaining:", this.capacity - current);
    return true;
  }
}

export const fixedWindowRateLimitter = new FixedWindowRateLimitter(
  WINDOW_SIZE,
  PERIOD,
);
