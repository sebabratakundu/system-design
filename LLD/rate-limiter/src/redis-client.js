import { createClient } from "redis";

export const client = createClient({
  url: "redis://127.0.0.1:6379",
});

client.on("error", (err) => {
  console.error("Redis error: ", err.message);
});

try {
  await client.connect();
  await client.ping();
} catch (err) {
  console.error(`✗ Failed to connect to Redis: ${err.message}`);
  process.exit(1);
}
