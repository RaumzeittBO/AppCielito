export type SyncRecord = { id: string; updatedAt?: unknown; [field: string]: unknown };
export type RecordDelta<T extends SyncRecord> = { upsert: T[]; remove: string[] };

function comparable(record: SyncRecord) {
  const { updatedAt: _updatedAt, ...data } = record;
  return JSON.stringify(data);
}

/** Return only changed documents so unrelated historical records are never rewritten. */
export function diffRecords<T extends SyncRecord>(previous: T[], next: T[]): RecordDelta<T> {
  const oldRows = new Map(previous.map(record => [record.id, record]));
  const nextRows = new Map(next.map(record => [record.id, record]));
  return {
    upsert: [...nextRows].flatMap(([id, record]) => oldRows.has(id) && comparable(oldRows.get(id)!) === comparable(record) ? [] : [record]),
    remove: [...oldRows.keys()].filter(id => !nextRows.has(id)),
  };
}
