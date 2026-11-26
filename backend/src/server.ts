import { MongoClient } from "mongodb";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureIndexes } from "./indexes.js";

const config = loadConfig(process.env);
const client = await MongoClient.connect(config.mongoUri);
const db = client.db();
await ensureIndexes(db);

// No `trust proxy` setting: nothing here reads req.ip or req.secure, and the hop count is unknown.
const app = createApp({ db, now: () => new Date(), allowedOrigins: config.allowedOrigins });
const server = app.listen(config.port, () => console.log(`API listening on ${config.port}`));

const shutdown = () => {
  server.close(() => {
    void client.close().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
