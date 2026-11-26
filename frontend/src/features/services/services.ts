import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../shared/api";
import { refusalOf } from "../../shared/apiRefusal";
import { requireOnline } from "../../shared/offlineWrite";

export interface Service {
  id: string;
  name: string;
  active: boolean;
  price: number | null; // null for services recorded before pricing
}

export interface StaffMember {
  id: string;
  displayName: string;
}

const KEY = "services";

export function useServices() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async (): Promise<Service[]> => {
      const res = await apiFetch("/api/services");
      if (!res.ok) throw await refusalOf(res);
      return ((await res.json()) as { services: Service[] }).services;
    },
  });
}

// Creates when `id` is absent, otherwise renames that service.
export function useSaveService(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      requireOnline();
      const res = await apiFetch(id ? `/api/services/${id}` : "/api/services", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSetServiceActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      requireOnline();
      const res = await apiFetch(`/api/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: async (): Promise<StaffMember[]> => {
      const res = await apiFetch("/api/staff");
      if (!res.ok) throw await refusalOf(res);
      return ((await res.json()) as { staff: StaffMember[] }).staff;
    },
  });
}
