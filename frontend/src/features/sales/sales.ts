import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../shared/api";
import { refusalOf } from "../../shared/apiRefusal";
import { dayRange } from "../appointments/slots";

export interface SaleLine {
  kind: "service" | "product";
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  customerId: string;
  vehicleId: string;
  lines: SaleLine[];
  total: number;
  status: "active" | "cancelled";
  createdAt: string;
}

export interface SaleInput {
  customerId: string;
  vehicleId: string;
  lines: { kind: "service" | "product"; refId: string; quantity: number }[];
}

const KEY = "sales";

// Sales whose creation time falls on the chosen local day.
export function useSales(day: string) {
  return useQuery({
    queryKey: [KEY, day],
    queryFn: async (): Promise<Sale[]> => {
      const { from, to } = dayRange(day);
      const query = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const res = await apiFetch(`/api/sales${query}`);
      if (!res.ok) throw await refusalOf(res);
      return ((await res.json()) as { sales: Sale[] }).sales;
    },
  });
}

export function useRecordSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleInput) => {
      const res = await apiFetch("/api/sales", { method: "POST", body: JSON.stringify(input) });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => {
      // Stock changes too, so the product list must be refreshed with the sale.
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCancelSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/sales/${id}/cancel`, { method: "POST" });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
