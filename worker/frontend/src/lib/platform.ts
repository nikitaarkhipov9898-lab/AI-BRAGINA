import Dexie, { type Table } from "dexie";
import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

export type LocalProfile = {
  id: "current";
  firstName: string;
  lastName: string;
  displayName: string;
  about: string;
  updatedAt: number;
};

export type LocalTask = {
  id?: number;
  title: string;
  serverId?: string;
  dueAt?: number;
  completed: boolean;
  createdAt: number;
};

class SoyuzDatabase extends Dexie {
  profiles!: Table<LocalProfile, string>;
  tasks!: Table<LocalTask, number>;
  constructor() {
    super("soyuz-local");
    this.version(1).stores({
      profiles: "id, updatedAt",
      tasks: "++id, completed, dueAt, createdAt",
    });
  }
}
export const soyuzDb = new SoyuzDatabase();

type AppState = {
  tab: string;
  setTab: (tab: string) => void;
};
export const useSoyuzStore = create<AppState>((set) => ({
  tab: "home",
  setTab: (tab) => set({ tab }),
}));

export const soyuzQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = typeof input === "string" && input.startsWith("/") ? apiBaseUrl + input : input;
  return fetch(target, init);
}
