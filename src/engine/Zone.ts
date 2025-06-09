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