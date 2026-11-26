import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../shared/api";
import { refusalOf } from "../../shared/apiRefusal";

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
      const res = await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(input) });
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
      const res = await apiFetch(`/api/customers/${customerId}/vehicles`, {
        method: "POST",
        body: JSON.stringify({ plate, model }),
      });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
