import autocannon from "autocannon";

const USER_IDS = ["1", "2", "3", "4", "5"];
const TARGET_URL = process.env.TARGET_URL || "http://localhost:8080";

let userIndex = 0;

console.log(`Starting autocannon load test against: ${TARGET_URL}`);
console.log(
  `Cycling requests across ${USER_IDS.length} users: [${USER_IDS.join(", ")}]`,
);

const instance = autocannon(
  {
    url: TARGET_URL,
    method: "POST",
    connections: 10, // 10 concurrent connections
    duration: 10, // run for 10 seconds
    pipelining: 1,
    headers: {
      "content-type": "application/json",
    },
    // Set custom dynamic body with cycling userIds per request
    requests: [
      {
        method: "POST",
        path: "/",
        setupRequest: (request) => {
          const userId = USER_IDS[userIndex % USER_IDS.length];
          userIndex++;
          request.body = JSON.stringify({ userId });
          return request;
        },
      },
    ],
  },
  (err, result) => {
    if (err) {
      console.error("Autocannon error:", err);
      process.exit(1);
    }
    console.log("\n=== Load Test Completed ===");
    console.log(`2xx Responses (Allowed):      ${result["2xx"]}`);
    console.log(`4xx Responses (Rate Limited): ${result["4xx"]}`);
    console.log(`Total Requests Sent:          ${result.requests.total}`);
    console.log(`Average Requests/sec:         ${result.requests.average}`);
  },
);

// Stream progress live in terminal
autocannon.track(instance, {
  renderProgressBar: true,
  renderResultsTable: true,
});
