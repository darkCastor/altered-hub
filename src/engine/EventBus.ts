import type { GamePhase } from "./types/enums";
import type { IGameObject } from "./types/objects";
import type { ICardInstance } from "./types/cards";
import type { IZone } from "./types/zones";
type EventPayloads = {
entityMoved: { entity: IGameObject | ICardInstance; from: IZone; to: IZone | null };
entityCeasedToExist: { entity: IGameObject | ICardInstance; from: IZone; };
phaseChanged: { phase: GamePhase };
turnAdvanced: { currentPlayerId: string };
dayAdvanced: { dayNumber: number };
manaSpent: { playerId: string; amount: number };
statusGained: { targetId: string; status: string };
afternoonEnded: Record<string, never>;
// Add other event types and their expected payload structures here
};
type EventType = keyof EventPayloads;
type EventHandler<T extends EventType> = (payload: EventPayloads[T]) => void;
export class EventBus {
private subscribers: Map<EventType, EventHandler<any>[]> = new Map();
subscribe<T extends EventType>(eventType: T, handler: EventHandler<T>) {
    if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(handler);
    console.log(`[EventBus] Subscribed to ${eventType}`);
}

publish<T extends EventType>(eventType: T, payload: EventPayloads[T]) {
    console.log(`[EventBus] Publishing: ${eventType}`, payload);
    if (this.subscribers.has(eventType)) {
        this.subscribers.get(eventType)!.forEach(handler => {
            try {
                handler(payload);
            } catch (error) {
                console.error(`Error in event handler for ${eventType}:`, error);
            }
        });
    }
}}