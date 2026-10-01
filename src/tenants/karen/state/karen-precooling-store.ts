import { create } from "zustand";
import {
  karenPrecoolingApi,
  type PrecoolingSummary,
} from "../api/karen-precooling-api";
import {
  extractBoxLabel,
  resolveStagingResponse,
  type StageOutcome,
} from "./karen-staging-store";
import { mapAxiosError } from "@/src/core/api/client";
import { tomorrowISO } from "@/src/core/date";

type State = {
  submitting: boolean;
  lastOutcome: StageOutcome | null;
  deliveryDate: string;
  summary: PrecoolingSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  setDeliveryDate: (date: string) => void;
  loadSummary: () => Promise<void>;
  /** Parse a scanned box QR, put the box into precooling, return the outcome.
   *  Boxes leave precooling at staging, not here. */
  submitScan: (raw: string) => Promise<StageOutcome>;
  reset: () => void;
};

export const useKarenPrecoolingStore = create<State>((set, get) => ({
  submitting: false,
  lastOutcome: null,
  deliveryDate: tomorrowISO(),
  summary: null,
  summaryLoading: false,
  summaryError: null,

  setDeliveryDate: (date) => {
    set({ deliveryDate: date, summary: null });
    void get().loadSummary();
  },

  loadSummary: async () => {
    const date = get().deliveryDate;
    set({ summaryLoading: true, summaryError: null });
    try {
      const summary = await karenPrecoolingApi.fetchPrecoolingSummary(date);
      if (get().deliveryDate === date) set({ summary, summaryLoading: false });
    } catch (err) {
      if (get().deliveryDate === date) {
        set({
          summaryLoading: false,
          summaryError:
            mapAxiosError(err).message || "Failed to load box counts.",
        });
      }
    }
  },

  submitScan: async (raw) => {
    const fail = (kind: "error" | "warning", message: string): StageOutcome => {
      const out: StageOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    const boxLabel = extractBoxLabel(raw);
    if (!boxLabel) return fail("warning", "Please scan a valid box QR code.");

    set({ submitting: true });
    let result: { status?: string; message?: string };
    try {
      result = resolveStagingResponse(
        await karenPrecoolingApi.createPrecoolingEntry(boxLabel, "in"),
      );
    } catch (err) {
      set({ submitting: false });
      return fail(
        "error",
        mapAxiosError(err).message || "Failed to record precooling.",
      );
    }
    set({ submitting: false });

    if (result.status === "success") {
      const out: StageOutcome = {
        kind: "success",
        message: result.message || "Box in precooling",
      };
      set({ lastOutcome: out });
      void get().loadSummary();
      return out;
    }
    if (result.status === "duplicate") {
      return fail(
        "warning",
        result.message || "This box has already been scanned.",
      );
    }
    return fail("error", result.message || "Failed to record precooling.");
  },

  reset: () =>
    set({
      submitting: false,
      lastOutcome: null,
      deliveryDate: tomorrowISO(),
      summary: null,
      summaryError: null,
    }),
}));
