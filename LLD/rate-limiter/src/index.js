import express from "express";
import cors from "cors";
import { rateLimitterMiddleware } from "./rateLimitter.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
  await rateLimitterMiddleware(req, res, next);
});

app.post("/", (req, res) => {
  res
    .json({
      message: "working",
    })
    .status(200);
});

app.listen(8080, (PORT) => {
  console.log("server started, listing on PORT", PORT);
});
