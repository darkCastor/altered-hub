import type { IZone, ZoneEntity } from './types/zones';
import { ZoneIdentifier } from './types/enums';
import { isGameObject } from './types/objects';
import type { ICardInstance } from './types/cards';


export abstract class BaseZone implements IZone {
    public readonly id: string;
    public readonly zoneType: ZoneIdentifier;
    public readonly visibility: 'hidden' | 'visible';
    public readonly ownerId?: string;
    public entities: Map<string, ZoneEntity>;

    constructor(id: string, zoneType: ZoneIdentifier, visibility: 'hidden' | 'visible', ownerId?: string) {
        this.id = id;
        this.zoneType = zoneType;
        this.visibility = visibility;
        this.ownerId = ownerId;
        this.entities = new Map();
    }

    add(entity: ZoneEntity): void {
        const key = isGameObject(entity) ? entity.objectId : entity.instanceId;
        this.entities.set(key, entity);
    }

    remove(entityId: string): ZoneEntity | undefined {
        const entity = this.entities.get(entityId);
        if (entity) {
            this.entities.delete(entityId);
        }
        return entity;
    }

    findById(entityId: string): ZoneEntity | undefined {
        return this.entities.get(entityId);
    }

    getAll(): ZoneEntity[] {
        return Array.from(this.entities.values());
    }

    getCount(): number {
        return this.entities.size;
    }
}

export class DeckZone extends BaseZone {
    public entities: ICardInstance[];

    constructor(id: string, ownerId: string) {
        super(id, ZoneIdentifier.Deck, 'hidden', ownerId);
        this.entities = [];
    }
    
    add(entity: ZoneEntity): void {
        if (!isGameObject(entity)) {
            this.entities.push(entity);
        }
    }

    addBottom(entities: ICardInstance[]): void {
        this.entities.push(...entities);
    }

    removeTop(): ICardInstance | undefined {
        return this.entities.shift();
    }

    remove(entityId: string): ZoneEntity | undefined {
        const index = this.entities.findIndex(e => e.instanceId === entityId);
        if (index > -1) {
            const [removedEntity] = this.entities.splice(index, 1);
            return removedEntity;
        }
        return undefined;
    }

    findById(entityId: string): ZoneEntity | undefined {
        return this.entities.find(e => e.instanceId === entityId);
    }

    getAll(): ZoneEntity[] {
        return [...this.entities];
    }

    getCount(): number {
        return this.entities.length;
    }

    shuffle(): void {
        for (let i = this.entities.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.entities[i], this.entities[j]] = [this.entities[j], this.entities[i]];
        }
        console.log(`[Zone] Deck ${this.id} has been shuffled.`);
    }
}


export class HandZone extends BaseZone {
    constructor(id: string, ownerId: string) {
        super(id, ZoneIdentifier.Hand, 'hidden', ownerId);
    }
}

export class DiscardPileZone extends BaseZone {
    constructor(id: string, ownerId: string) {
        super(id, ZoneIdentifier.DiscardPile, 'visible', ownerId);
    }
}

export class LimboZone extends BaseZone {
    constructor() {
        super("shared-limbo", ZoneIdentifier.Limbo, 'visible');
    }
}
