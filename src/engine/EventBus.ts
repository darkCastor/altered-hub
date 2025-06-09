type EventHandler = (payload: any) => void;

export class EventBus {
    private subscribers: Map<string, EventHandler[]> = new Map();

    subscribe(eventType: string, handler: EventHandler) {
        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, []);
        }
        this.subscribers.get(eventType)!.push(handler);
    }

    publish(eventType: string, payload: any) {
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
    }
}