/**
 * Storage boundary.
 *
 * Everything above this interface — the rules, the board, the screens — is
 * unaware of where records live. That is what makes the backend a choice rather
 * than a rewrite: artifact storage today, SharePoint lists or a database later.
 *
 * The interface is deliberately per-record rather than whole-collection. The
 * original app saved every record as one blob, so two people saving within a
 * moment of each other silently overwrote one another. With six people editing,
 * that is likely rather than theoretical.
 */

import type { MovementRecord } from "./types";

export type StoreCapabilities = {
  /** Whether other people see these records. False for device-local storage. */
  shared: boolean;
  /** Approximate byte ceiling, or null when there is no practical limit. */
  byteLimit: number | null;
  /** Whether deletes can be undone from the backend itself. */
  hasRecycleBin: boolean;
  /** Human-readable name for the status bar: "SharePoint", "this device". */
  label: string;
};

export interface RecordStore {
  readonly capabilities: StoreCapabilities;

  /** Every record. Implementations must page internally if the backend does. */
  list(): Promise<MovementRecord[]>;

  /** Writes one record. Creates it when the id is not already present. */
  put(record: MovementRecord): Promise<void>;

  /**
   * Writes several records. Implementations should write them individually so
   * a concurrent edit to a different record is not lost.
   */
  putMany(records: MovementRecord[]): Promise<void>;

  remove(id: string): Promise<void>;

  /**
   * A token that changes whenever anyone writes, so the app can notice a
   * colleague's save without reloading everything. Null when unsupported.
   */
  revision?(): Promise<string | null>;
}

/** Key/value storage for settings, the team list and the activity log. */
export interface SettingsStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------

/**
 * The runtime provided by Claude artifact hosting. Records are held as one JSON
 * blob under a single key, which is why this backend has a size ceiling and
 * cannot write records individually.
 */
type ArtifactStorage = {
  get(key: string, shared: boolean): Promise<{ value: string } | null>;
  set(key: string, value: string, shared: boolean): Promise<void>;
  delete(key: string, shared: boolean): Promise<void>;
};

const RECORDS_KEY = "tlt:records-v1";

/** Roughly the per-key ceiling in artifact storage. */
export const ARTIFACT_BYTE_LIMIT = 5 * 1024 * 1024;

/**
 * Adapter over artifact storage — the behaviour the app has today, expressed
 * against the interface above so it can be swapped out.
 *
 * `putMany` rewrites the whole blob because the backend offers nothing finer.
 * That is the concurrency weakness, and it is confined to this class.
 */
export class ArtifactRecordStore implements RecordStore {
  readonly capabilities: StoreCapabilities = {
    shared: true,
    byteLimit: ARTIFACT_BYTE_LIMIT,
    hasRecycleBin: false,
    label: "shared storage",
  };

  constructor(private readonly storage: ArtifactStorage) {}

  async list(): Promise<MovementRecord[]> {
    const res = await this.storage.get(RECORDS_KEY, true);
    if (!res?.value) return [];
    return JSON.parse(res.value) as MovementRecord[];
  }

  async put(record: MovementRecord): Promise<void> {
    const all = await this.list();
    const index = all.findIndex((r) => r.id === record.id);
    if (index >= 0) all[index] = record;
    else all.push(record);
    await this.writeAll(all);
  }

  async putMany(records: MovementRecord[]): Promise<void> {
    const all = await this.list();
    const byId = new Map(all.map((r) => [r.id, r]));
    for (const record of records) byId.set(record.id, record);
    await this.writeAll([...byId.values()]);
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    await this.writeAll(all.filter((r) => r.id !== id));
  }

  private async writeAll(records: MovementRecord[]): Promise<void> {
    const payload = JSON.stringify(records);
    if (payload.length > ARTIFACT_BYTE_LIMIT) {
      throw new StorageFullError(payload.length, ARTIFACT_BYTE_LIMIT);
    }
    await this.storage.set(RECORDS_KEY, payload, true);
  }
}

/** Raised rather than letting a save fail silently and lose the day's work. */
export class StorageFullError extends Error {
  constructor(
    readonly needed: number,
    readonly limit: number,
  ) {
    super(
      `Records need ${(needed / 1_048_576).toFixed(1)} MB but the limit is ` +
        `${(limit / 1_048_576).toFixed(1)} MB. Archive older records, or move ` +
        `to a backend without a per-key ceiling.`,
    );
    this.name = "StorageFullError";
  }
}

/** Size of the record set as it would be written, for the settings screen. */
export function estimateBytes(records: MovementRecord[]): number {
  return JSON.stringify(records).length;
}
