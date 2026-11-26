// A refusal from the API, carrying the stable error code so the UI can pick the right message.
export class ApiRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiRefusal";
    this.code = code;
  }
}

export async function refusalOf(res: Response): Promise<ApiRefusal> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
    const code = typeof body.error?.code === "string" ? body.error.code : "UNKNOWN";
    const message = typeof body.error?.message === "string" ? body.error.message : "";
    return new ApiRefusal(code, message);
  } catch {
    return new ApiRefusal("UNKNOWN", "");
  }
}
