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

    clear(): void {
        this.entities.clear();
    }

    contains(entityId: string): boolean {
        return this.entities.has(entityId);
    }
}

export class DeckZone extends BaseZone {

    constructor(id: string, ownerId: string) {
        super(id, ZoneIdentifier.Deck, 'hidden', ownerId);
    }
    
    addBottom(entities: ICardInstance[]): void {
        entities.forEach(entity => this.entities.set(entity.instanceId, entity));
    }

    removeTop(): ICardInstance | undefined {
        const entitiesArray = Array.from(this.entities.values()).filter(e => !isGameObject(e)) as ICardInstance[];
        if (entitiesArray.length > 0) {
            const topEntity = entitiesArray[0];
            this.entities.delete(topEntity.instanceId);
            return topEntity;
        }
        return undefined;
    }

    shuffle(): void {
        const entitiesArray = Array.from(this.entities.values()).filter(e => !isGameObject(e)) as ICardInstance[];
        this.entities.clear();
        
        // Fisher-Yates shuffle
        for (let i = entitiesArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [entitiesArray[i], entitiesArray[j]] = [entitiesArray[j], entitiesArray[i]];
        }
        
        entitiesArray.forEach(entity => this.entities.set(entity.instanceId, entity));
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

export class GenericZone extends BaseZone {
    constructor(id: string, zoneType: ZoneIdentifier, visibility: 'hidden' | 'visible', ownerId?: string) {
        super(id, zoneType, visibility, ownerId);
    }
}
