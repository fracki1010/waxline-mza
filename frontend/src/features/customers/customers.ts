import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../shared/api";
import { refusalOf } from "../../shared/apiRefusal";
import { messages } from "../../shared/messages";
import { newClientId } from "../../shared/outbox";
import { queueWithId } from "../../shared/offlineWrite";

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  vehicles: Vehicle[];
}

const KEY = "customers";

// An empty term lists the first customers; a term searches by name, phone or plate.
export function useCustomers(term: string) {
  return useQuery({
    queryKey: [KEY, term],
    queryFn: async (): Promise<Customer[]> => {
      const query = term.trim() ? `?q=${encodeURIComponent(term.trim())}` : "";
      const res = await apiFetch(`/api/customers${query}`);
      if (!res.ok) throw await refusalOf(res);
      return ((await res.json()) as { customers: Customer[] }).customers;
    },
  });
}

export function useAddCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone: string }) => {
      const clientId = newClientId();
      const body = { ...input, clientId };
      if (
        await queueWithId(clientId, {
          method: "POST",
          path: "/api/customers",
          body,
          label: messages.outboxCustomer,
        })
      ) {
        return;
      }
      const res = await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAddVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      customerId,
      plate,
      model,
    }: {
      customerId: string;
      plate: string;
      model: string;
    }) => {
      const clientId = newClientId();
      const path = `/api/customers/${customerId}/vehicles`;
      const body = { plate, model, clientId };
      if (
        await queueWithId(clientId, {
          method: "POST",
          path,
          body,
          label: messages.outboxVehicle,
        })
      ) {
        return;
      }
      const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
