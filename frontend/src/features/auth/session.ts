import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearSignOutNotice, setSignOutNotice } from "./signOutNotice";
import { NetworkError, SessionLostError, apiFetch } from "../../shared/api";
import type { messages } from "../../shared/messages";
import { SESSION_KEY, endSession, purgeData } from "../../shared/queryClient";

export type Staff = { id: string; displayName: string };

async function readUser(res: Response): Promise<Staff> {
  const body: unknown = await res.json().catch(() => null);
  const user = (body as { user?: Partial<Staff> } | null)?.user;
  if (typeof user?.id !== "string" || typeof user.displayName !== "string") {
    throw new Error("unexpected response");
  }
  return { id: user.id, displayName: user.displayName };
}

// Data is null when signed out: a 401 is an answer here, not an error.
export function useSession() {
  const client = useQueryClient();
  return useQuery<Staff | null>({
    queryKey: SESSION_KEY,
    // Always revalidate on focus/reconnect: a stale tab must learn about a sign-out elsewhere.
    staleTime: 0,
    refetchOnMount: false, // later observers (Home) must not trigger a second request
    retry: 1,
    retryDelay: 500,
    queryFn: async () => {
      try {
        const res = await apiFetch("/api/auth/me");
        if (!res.ok) throw new Error(`me ${res.status}`);
        return await readUser(res);
      } catch (e) {
        if (e instanceof SessionLostError) {
          purgeData(client);
          return null;
        }
        throw e;
      }
    },
  });
}

type TextId = {
  [K in keyof typeof messages]: (typeof messages)[K] extends string ? K : never;
}[keyof typeof messages];

export class SignInError extends Error {
  constructor(readonly messageId: TextId) {
    super(messageId);
    this.name = "SignInError";
  }
}

async function errorCode(res: Response): Promise<unknown> {
  const body: unknown = await res.json().catch(() => null);
  return (body as { error?: { code?: unknown } } | null)?.error?.code;
}

export function useSignIn() {
  const client = useQueryClient();
  return useMutation<Staff, SignInError, { username: string; password: string }>({
    mutationFn: async (credentials) => {
      let res: Response;
      try {
        res = await apiFetch(
          "/api/auth/sign-in",
          { method: "POST", body: JSON.stringify(credentials) },
          { expectSessionLoss: false },
        );
      } catch (e) {
        throw new SignInError(e instanceof NetworkError ? "offline" : "genericError");
      }
      if (res.ok) {
        try {
          return await readUser(res);
        } catch {
          throw new SignInError("genericError");
        }
      }
      if (res.status === 401) throw new SignInError("wrongCredentials");
      if (res.status === 400) throw new SignInError("validationRequired");
      if (res.status === 429) {
        const code = await errorCode(res);
        throw new SignInError(
          code === "LOCKED"
            ? "locked"
            : code === "TOO_MANY_REQUESTS"
              ? "serverBusy"
              : "genericError",
        );
      }
      throw new SignInError("genericError");
    },
    onMutate: () => clearSignOutNotice(client),
    onSuccess: async (staff) => {
      await client.cancelQueries({ queryKey: SESSION_KEY });
      purgeData(client);
      client.setQueryData(SESSION_KEY, staff);
    },
  });
}

// Whatever the request does, local state is wiped: signing out must never leave data behind.
// When the server did not confirm, the sign-in screen says so (a 401 means it is already gone).
export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        "/api/auth/sign-out",
        { method: "POST" },
        { expectSessionLoss: false },
      );
      if (!res.ok && res.status !== 401) throw new Error(`sign-out ${res.status}`);
    },
    onSettled: async (_data, error) => {
      setSignOutNotice(client, error !== null);
      await endSession(client);
    },
  });
}
