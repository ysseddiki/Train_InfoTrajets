/**
 * DisruptionIngestPort — stub implementation placeholder.
 * Swap via INGEST_PROVIDER=stub|prim|navitia
 */
export interface DisruptionIngestPort {
  poll(): Promise<void>;
}

export class StubIngestAdapter implements DisruptionIngestPort {
  async poll(): Promise<void> {
    // No-op skeleton — wire synthetic events in the next iteration
  }
}
