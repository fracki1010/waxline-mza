import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../shared/api";
import { refusalOf } from "../../shared/apiRefusal";
import { requireOnline } from "../../shared/offlineWrite";

export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  active: boolean;
}

export interface ProductInput {
  name: string;
  unit: string;
  price: number;
  quantity: number;
}

const KEY = "products";

export function useProducts() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async (): Promise<Product[]> => {
      const res = await apiFetch("/api/products");
      if (!res.ok) throw await refusalOf(res);
      return ((await res.json()) as { products: Product[] }).products;
    },
  });
}

export function useAddProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      requireOnline();
      const res = await apiFetch("/api/products", { method: "POST", body: JSON.stringify(input) });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// A positive delta adds stock; a negative one takes it out and is refused when there is not enough.
export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      requireOnline();
      const res = await apiFetch(`/api/products/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSetProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      requireOnline();
      const res = await apiFetch(`/api/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
