import type { z } from "zod";

export interface StorageStatus {
  available: boolean;
  message?: string;
}

export function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const key = "__ringcare_storage_test__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface ReadResult<T> {
  value: T | null;
  found: boolean;
  corrupted: boolean;
  storageAvailable: boolean;
}

/** Read and validate a JSON value. Corrupted values never crash the app. */
export function readStoredValue<T>(key: string, schema: z.ZodType<T>): ReadResult<T> {
  const storage = getBrowserStorage();
  if (!storage) {
    return { value: null, found: false, corrupted: false, storageAvailable: false };
  }
  const raw = storage.getItem(key);
  if (raw === null) {
    return { value: null, found: false, corrupted: false, storageAvailable: true };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return { value: null, found: true, corrupted: true, storageAvailable: true };
    }
    return { value: result.data, found: true, corrupted: false, storageAvailable: true };
  } catch {
    return { value: null, found: true, corrupted: true, storageAvailable: true };
  }
}

export function writeStoredValue(key: string, value: unknown): StorageStatus {
  const storage = getBrowserStorage();
  if (!storage) {
    return { available: false, message: "Browser storage is unavailable in this context." };
  }
  try {
    storage.setItem(key, JSON.stringify(value));
    return { available: true };
  } catch (error) {
    const isQuota =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.code === 22);
    return {
      available: false,
      message: isQuota
        ? "Browser storage is full. Older demo records could not be saved."
        : "Browser storage could not be written.",
    };
  }
}

export function removeStoredValue(key: string): StorageStatus {
  const storage = getBrowserStorage();
  if (!storage) {
    return { available: false, message: "Browser storage is unavailable in this context." };
  }
  try {
    storage.removeItem(key);
    return { available: true };
  } catch {
    return { available: false, message: "Browser storage could not be cleared." };
  }
}
