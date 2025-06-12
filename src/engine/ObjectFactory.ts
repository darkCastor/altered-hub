import type { ICardDefinition, ICardInstance } from './types/cards';
import type { IGameObject, IEmblemObject } from './types/objects';
import { CardType, CounterType, StatusType } from './types/enums';
import type { IAbility, IEffect } from './types/abilities';
import { isGameObject } from './types/objects';

/**
 * Responsible for creating new instances of game objects.
 * This is central to enforcing the "New Zone, New Object" Golden Rule.
 * Rule 1.4.4, 2.1.d
 */
export class ObjectFactory {
	private static nextId = 0;
	private static nextTimestamp = 0;

	private cardDefinitions: Map<string, ICardDefinition>;

	constructor(definitions: Map<string, ICardDefinition>) {
		this.cardDefinitions = definitions;
	}

	public static createUniqueId(): string {
		return `instance-${this.nextId++}`;
	}

	public static getNewTimestamp(): number {
		return this.nextTimestamp++;
	}

	public createCardInstance(definitionId: string, ownerId: string): ICardInstance {
		if (!this.cardDefinitions.has(definitionId)) {
			throw new Error(`Card definition not found: ${definitionId}`);
		}
		return {
			instanceId: ObjectFactory.createUniqueId(),
			definitionId,
			ownerId
		};
	}

	/**
	 * Creates a game object directly from a card definition
	 * Convenience method for testing and game initialization
	 */
	public createCard(definitionId: string, ownerId: string): IGameObject {
		const cardInstance = this.createCardInstance(definitionId, ownerId);
		return this.createGameObject(cardInstance, ownerId);
	}

	public createGameObject(
		source: ICardInstance | IGameObject,
		controllerId: string,
		initialCounters?: Map<CounterType, number> // Allow specifying initial counters
	): IGameObject {
		const definition = this.cardDefinitions.get(source.definitionId);
		if (!definition) {
			throw new Error(`Card definition not found: ${source.definitionId}`);
		}

		const baseCharacteristics = { ...definition };

		const instantiatedAbilities = definition.abilities.map((ability) => ({ ...ability }));

		const newObject: IGameObject = {
			id: (source as ICardInstance).instanceId || ObjectFactory.createUniqueId(), // Ensure 'id' is populated
			objectId: ObjectFactory.createUniqueId(),
			definitionId: source.definitionId,
			name: definition.name,
			type: definition.type,
			subTypes: definition.subTypes,
			baseCharacteristics,
			currentCharacteristics: { ...baseCharacteristics },
			ownerId: source.ownerId,
			controllerId: controllerId,
			timestamp: ObjectFactory.getNewTimestamp(),
			statuses: new Set<StatusType>(),
			counters: new Map<CounterType, number>(), // Default to empty map
			abilities: [], // This will be populated later
			abilityActivationsToday: new Map<string, number>() // Initialize here
		};

		// Apply initial counters if provided by the GameStateManager.
		if (initialCounters) {
			newObject.counters = new Map(initialCounters);
		}

		// Correctly copy statuses from the source if it was an object (e.g., in Limbo/Reserve).
		if (isGameObject(source)) {
			newObject.statuses = new Set(source.statuses);
		}

		newObject.abilities = instantiatedAbilities.map((ability) => ({
			...ability,
			sourceObjectId: newObject.objectId,
			effect: { ...ability.effect, sourceObjectId: newObject.objectId }
		}));

		return newObject;
	}

	public createReactionEmblem(
		sourceAbility: IAbility,
		sourceObject: IGameObject, // This is the object that *has* the reaction ability
		triggerPayload: unknown
	): IEmblemObject {
		if (!sourceObject.objectId) { // Changed from sourceAbility.sourceObjectId for clarity
			throw new Error('Cannot create emblem from an ability not bound to a valid object.');
		}

		// Capture LKI: Create a snapshot of the sourceObject
		// IMPORTANT: JSON.parse(JSON.stringify(...)) is a simple deep clone but has limitations.
		// It won't correctly clone Maps, Sets, Dates, functions, or undefined values.
		// For IGameObject, `statuses` (Set) and `counters` (Map), abilityActivationsToday (Map)
		// will not be cloned correctly by this method.
		// A more robust deep cloning utility or manual selective cloning of essential LKI properties is needed.
		// For this subtask, we will proceed with a shallow copy of key LKI properties
		// and acknowledge the need for a better deep clone if complex state is required from LKI.

		const lkiSnapshot: Partial<Readonly<IGameObject>> = {
			objectId: sourceObject.objectId,
			definitionId: sourceObject.definitionId,
			name: sourceObject.name,
			type: sourceObject.type,
			subTypes: sourceObject.subTypes ? [...sourceObject.subTypes] : undefined,
			// Snapshot currentCharacteristics, as these are most likely to be needed for LKI
			currentCharacteristics: JSON.parse(JSON.stringify(sourceObject.currentCharacteristics)),
			ownerId: sourceObject.ownerId,
			controllerId: sourceObject.controllerId,
			// Last known statuses and counters might be important
			statuses: new Set(sourceObject.statuses), // Shallow copy of set content
			counters: new Map(sourceObject.counters), // Shallow copy of map content
			// Zone information is not directly on IGameObject, but could be passed via triggerPayload if needed
		};

		const boundEffect: IEffect = {
			...sourceAbility.effect,
			sourceObjectId: sourceObject.objectId, // Still the ID of the original object
			_triggerPayload: triggerPayload,
			_lkiSourceObject: lkiSnapshot as Readonly<IGameObject> // Store the snapshot
		};

		const emblem: IEmblemObject = {
			objectId: ObjectFactory.createUniqueId(),
			definitionId: `emblem-reaction-${sourceAbility.abilityId}`,
			name: `Reaction: ${sourceAbility.text}`,
			type: CardType.Emblem,
			emblemSubType: 'Reaction',
			baseCharacteristics: {},
			currentCharacteristics: {},
			ownerId: sourceObject.ownerId,
			controllerId: sourceObject.controllerId,
			timestamp: ObjectFactory.getNewTimestamp(),
			statuses: new Set(),
			counters: new Map(),
			abilities: [],
			boundEffect: boundEffect,
			// abilityActivationsToday can be omitted for emblems as they don't have abilities to activate
		};

		return emblem;
	}
}
