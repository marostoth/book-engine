import type { AnalyticalStore } from "../types/analytical.ts";
import { callBackend } from "./clientBase.ts";

export async function getAnalyticalData(bookId: string): Promise<AnalyticalStore> {
  return callBackend<AnalyticalStore>("get_analytical_data", { bookId }, (dev) => dev.getAnalyticalData(bookId));
}

export async function saveAnalyticalData(bookId: string, data: AnalyticalStore): Promise<void> {
  return callBackend<void>("save_analytical_data", { bookId, data }, (dev) => dev.saveAnalyticalData(bookId, data));
}
