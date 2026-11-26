import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { SessionLostError } from "./api";
import { persister } from "./persist";

export const SESSION_KEY = ["session"] as const;

// Drops every cached entry except the session itself, so no staff data survives a session change.
export function purgeData(client: QueryClient): void {
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
}

// Signed-out state: session is null and all other cached data is gone, including the copy kept in
// IndexedDB. The session entry stays (as null) so mounted observers keep working. In-flight /me
// requests are cancelled first so a late answer cannot resurrect the old session.
export async function endSession(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: SESSION_KEY });
  client.setQueryData(SESSION_KEY, null);
  purgeData(client);
  await persister.removeClient();
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // A 401 from any /api/ call mid-session means the session is gone.
    queryCache: new QueryCache({
      onError: (e) => e instanceof SessionLostError && void endSession(client),
    }),
    mutationCache: new MutationCache({
      onError: (e) => e instanceof SessionLostError && void endSession(client),
    }),
    // gcTime 0 drops mutation variables (the password) as soon as nothing observes them.
    // networkMode "always": the default would pause a mutation while the browser reports offline,
    // so sign-in would spin forever and sign-out would never wipe local state. Failures surface
    // as NetworkError instead.
    defaultOptions: {
      queries: { retry: false },
      mutations: { gcTime: 0, retry: false, networkMode: "always" },
    },
  });
  return client;
}
