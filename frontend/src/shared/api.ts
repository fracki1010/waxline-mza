export class SessionLostError extends Error {
  constructor() {
    super("session lost");
    this.name = "SessionLostError";
  }
}

export class NetworkError extends Error {
  constructor() {
    super("network unreachable");
    this.name = "NetworkError";
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: { expectSessionLoss?: boolean } = {},
): Promise<Response> {
  if (
    !path.startsWith("/api/") ||
    path.includes("\\") ||
    path.split(/[?#]/)[0]!.split("/").includes("..")
  ) {
    throw new TypeError("apiFetch path must be a plain /api/ path");
  }
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 401 && options.expectSessionLoss !== false) throw new SessionLostError();
  return res;
}
