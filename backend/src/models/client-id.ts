import { MongoServerError, type Collection, type Document } from "mongodb";

// Client-generated id (UUID v4 from the offline outbox). Replaying a write with the same id returns the
// record created the first time, so a request that timed out and was sent again never duplicates data.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUPLICATE_KEY = 11000;

// undefined: not sent; null: sent but malformed; string: valid.
export function parseClientId(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export async function ensureClientIdIndex(collection: Collection<Document>): Promise<void> {
  // Partial so records created without a client id (before the offline work) are not indexed.
  await collection.createIndex(
    { clientId: 1 },
    { unique: true, partialFilterExpression: { clientId: { $type: "string" } } },
  );
}

export function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === DUPLICATE_KEY;
}
