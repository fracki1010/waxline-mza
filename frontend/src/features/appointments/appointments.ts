import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../shared/api";
import { refusalOf } from "../../shared/apiRefusal";
import { dayRange } from "./slots";

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  plate: string;
  model: string;
  serviceId: string;
  serviceName: string;
  employeeId: string;
  start: string;
  end: string;
  status: "active" | "cancelled";
}

export interface AppointmentInput {
  customerName: string;
  customerPhone: string;
  plate: string;
  model: string;
  serviceId: string;
  employeeId: string;
  start: Date;
  end: Date;
}

const KEY = "appointments";

export function useAppointments(day: string) {
  return useQuery({
    queryKey: [KEY, day],
    queryFn: async (): Promise<Appointment[]> => {
      const { from, to } = dayRange(day);
      const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const res = await apiFetch(`/api/appointments?${query}`);
      if (!res.ok) throw await refusalOf(res);
      return ((await res.json()) as { appointments: Appointment[] }).appointments;
    },
  });
}

function serialise(input: Partial<AppointmentInput>) {
  return {
    ...input,
    start: input.start?.toISOString(),
    end: input.end?.toISOString(),
  };
}

// Creates when `id` is absent, otherwise edits that appointment.
export function useSaveAppointment(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AppointmentInput) => {
      const res = await apiFetch(id ? `/api/appointments/${id}` : "/api/appointments", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(serialise(input)),
      });
      if (!res.ok) throw await refusalOf(res);
      return (await res.json()) as Appointment;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/appointments/${id}/cancel`, { method: "POST" });
      if (!res.ok) throw await refusalOf(res);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
