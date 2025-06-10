import type { ICardInstance } from './cards';
import type { IGameObject } from './objects';
import { ZoneIdentifier } from './enums';

export type ZoneEntity = ICardInstance | IGameObject;

/**
 * Base interface for all game zones.
 * Rule 3
 */
export interface IZone {
    id: string; // e.g., "Player1_Hand"
    zoneType: ZoneIdentifier;
    visibility: 'hidden' | 'visible'; // Rule 3.1.3
    ownerId?: string; // For personal zones (Rule 3.1.2)
    entities: Map<string, ZoneEntity> | ZoneEntity[]; // Allow array for ordered zones like Deck

    add(entity: ZoneEntity): void;
    remove(entityId: string): ZoneEntity | undefined;
    findById(entityId: string): ZoneEntity | undefined;
    getAll(): ZoneEntity[];
    getCount(): number;
}