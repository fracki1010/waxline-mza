import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { messages } from "./shared/messages";
import { createQueryClient } from "./shared/queryClient";

afterEach(() => vi.unstubAllGlobals());

it("shows the sign-in screen when there is no session", async () => {
  vi.stubGlobal("fetch", async () => new Response(null, { status: 401 }));
  render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("heading", { name: messages.signInTitle })).toBeInTheDocument();
});
