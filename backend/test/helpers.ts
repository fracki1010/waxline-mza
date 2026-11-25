import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27018";

export async function startTestDb(): Promise<{ db: Db; stop(): Promise<void> }> {
  let client: MongoClient;
  try {
    client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 3000 });
  } catch (cause) {
    throw new Error(
      `Test MongoDB is not reachable at ${uri}. Start it with: bash scripts/test-db.sh up`,
      {
        cause,
      },
    );
  }
  const db = client.db(`test_${randomBytes(6).toString("hex")}`);
  return {
    db,
    stop: async () => {
      await db.dropDatabase();
      await client.close();
    },
  };
}
