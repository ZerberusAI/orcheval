export interface TelemetryEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, string | number | boolean>;
}

export class EvidenceCollector {
  private readonly events: TelemetryEvent[] = [];

  record(name: string, attributes: Record<string, string | number | boolean> = {}): void {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  snapshot(): TelemetryEvent[] {
    return [...this.events];
  }
}
