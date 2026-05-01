export interface StreamEvent {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
