import type { IZone } from './types/zones';
import { ObjectFactory } from './ObjectFactory';
import { GamePhase, ZoneIdentifier, StatusType, CardType, CounterType, KeywordAbility } from './types/enums';
import type { EventBus } from './EventBus';
import { GenericZone, HandZone, DiscardPileZone, LimboZone, DeckZone } from './Zone';
import type { IGameObject, IEmblemObject } from './types/objects'; // Added IEmblemObject
import type { ICardInstance } from './types/cards';
import type { ZoneEntity } from './types/zones';
import { isGameObject } from './types/objects';
import type { IPlayer, IGameState, ITerrainStats } from './types/game';
import type { ICardDefinition } from './types/cards';
// import { KeywordAbility } from './types/enums'; // Unused
import { KeywordAbilityHandler } from './KeywordAbilityHandler';
import { SupportAbilityHandler } from './SupportAbilityHandler';
import { AdvancedTriggerHandler } from './AdvancedTriggerHandler';
import { PlayerActionHandler } from './PlayerActionHandler';
import { EffectProcessor } from './EffectProcessor';
import { StatusEffectHandler } from './StatusEffectHandler';
import { ManaSystem } from './ManaSystem';
import { CardPlaySystem } from './CardPlaySystem';
import type { TurnManager } from './TurnManager';
import type { PhaseManager } from './PhaseManager';
import { TiebreakerSystem } from './TiebreakerSystem';
// import { PassiveAbilityManager } from './PassiveAbilityManager'; // Removed
import { RuleAdjudicator } from './RuleAdjudicator';
import { ReactionManager } from './ReactionManager';

export class GameStateManager {
	public state: IGameState;
	public objectFactory: ObjectFactory;
	public eventBus: EventBus;
	public keywordHandler: KeywordAbilityHandler;
	public supportHandler: SupportAbilityHandler;
	public triggerHandler: AdvancedTriggerHandler;
	public actionHandler: PlayerActionHandler;
	public effectProcessor: EffectProcessor;
	public effectExecutionManager: EffectProcessor; // Alias for test compatibility
	public statusHandler: StatusEffectHandler;
	public manaSystem: ManaSystem;
	public cardPlaySystem: CardPlaySystem;
	public tiebreakerSystem: TiebreakerSystem;
	public reactionManager: ReactionManager;
	// public passiveManager: PassiveAbilityManager; // Removed
	public ruleAdjudicator: RuleAdjudicator;
	public turnManager?: TurnManager; // Will be set by TurnManager
	public phaseManager?: PhaseManager; // Will be set by PhaseManager
	private playerDeckDefinitions: Map<string, ICardDefinition[]>; // PlayerID to their chosen deck
	private allCardDefinitions: Map<string, ICardDefinition>; // All unique definitions for ObjectFactory

	constructor(playerDeckDefinitions: Map<string, ICardDefinition[]>, eventBus: EventBus) {
		this.playerDeckDefinitions = playerDeckDefinitions;

		// Create a flat list of all unique card definitions for ObjectFactory
		const allDefsList: ICardDefinition[] = [];
		const seenDefIds = new Set<string>();
		for (const deck of playerDeckDefinitions.values()) {
			for (const cardDef of deck) {
				if (!seenDefIds.has(cardDef.id)) {
					allDefsList.push(cardDef);
					seenDefIds.add(cardDef.id);
				}
			}
		}
		this.allCardDefinitions = new Map(allDefsList.map((def) => [def.id, def]));

		this.objectFactory = new ObjectFactory(this.allCardDefinitions);
		this.eventBus = eventBus;
		this.keywordHandler = new KeywordAbilityHandler(this);
		this.supportHandler = new SupportAbilityHandler(this);
		this.triggerHandler = new AdvancedTriggerHandler(this);
		this.actionHandler = new PlayerActionHandler(this);
		this.effectProcessor = new EffectProcessor(this);
		this.effectExecutionManager = this.effectProcessor;
		this.statusHandler = new StatusEffectHandler(this);
		this.manaSystem = new ManaSystem(this);
		this.cardPlaySystem = new CardPlaySystem(this);
		this.tiebreakerSystem = new TiebreakerSystem(this);
		this.ruleAdjudicator = new RuleAdjudicator(this);
		this.reactionManager = new ReactionManager(this, this.objectFactory, this.effectProcessor);

		const playerIds = Array.from(playerDeckDefinitions.keys());
		this.state = this.initializeGameState(playerIds); // Pass playerIds derived from the map
	}

	/**
	 * Rule 4.1: Game Setup Phase - Initialize game according to Altered rules
	 */
	public async initializeGame(): Promise<void> {
		if (this.playerDeckDefinitions.size === 0) {
			throw new Error('No player deck definitions available for game initialization.');
		}
		if (this.allCardDefinitions.size === 0) {
			throw new Error('No card definitions available for ObjectFactory.');
		}

		// Rule 4.1.l: Start on Day 1, skip first Morning phase
		this.state.currentDay = 1;
		this.state.currentPhase = GamePhase.Noon;
		this.state.firstMorningSkipped = true;

		// Rule 4.1.a-c: Initialize adventure zones and regions
		this.initializeAdventureZones();

		// Initialize each player's game state using their specific deck
		for (const [playerId, player] of this.state.players) {
			const deckDefs = this.playerDeckDefinitions.get(playerId);
			if (!deckDefs) {
				throw new Error(`Deck definitions not found for player ${playerId} during game initialization.`);
			}
			await this.initializePlayerState(playerId, player, deckDefs);
		}

		// Rule 4.1.g: Determine first player randomly
		const playerIds = Array.from(this.state.players.keys());
		if (playerIds.length > 0) {
			const randomIndex = Math.floor(Math.random() * playerIds.length);
			this.state.firstPlayerId = playerIds[randomIndex];
			this.state.currentPlayerId = this.state.firstPlayerId;
			console.log(`[GSM] Randomly selected first player: ${this.state.firstPlayerId}`);
		} else {
			throw new Error("Cannot determine first player: No players in game.");
		}

		console.log('[GSM] Game initialized with players:', playerIds);
	}

	private initializeAdventureZones(): void {
		const adventureZone = this.state.sharedZones.adventure;

		// Rule 4.1.b: Create Hero and Companion regions
		const heroRegion = {
			id: 'hero-region',
			instanceId: 'hero-region',
			type: 'HeroRegion',
			faceDown: false,
			terrainType: 'neutral',
			ownerId: 'shared',
			terrains: ['forest', 'mountain', 'water'] // Rule 2.2.2.k (simplified)
		};
		adventureZone.add(heroRegion as ZoneEntity);

		// Rule 4.1.c: Place 3 face-down Tumult cards (these go between Hero and Companion regions)
		for (let i = 0; i < 3; i++) {
			const tumultCard = {
				id: `tumult-${i}`,
				instanceId: `tumult-${i}`,
				type: 'TumultCard',
				faceDown: true,
				terrainType: 'tumult', // Should this be something else or derived? For now, keep.
				ownerId: 'shared',
				terrains: [] // Rule 2.2.2.k remark
			};
			adventureZone.add(tumultCard as ZoneEntity);
		}

		const companionRegion = {
			id: 'companion-region',
			instanceId: 'companion-region',
			type: 'CompanionRegion',
			faceDown: false,
			terrainType: 'neutral',
			ownerId: 'shared',
			terrains: ['forest', 'mountain', 'water'] // Rule 2.2.2.k (simplified)
		};
		adventureZone.add(companionRegion as ZoneEntity);
	}

	private async initializePlayerState(playerId: string, player: IPlayer, deckDefs: ICardDefinition[]): Promise<void> {
		// Rule 4.1.h: Heroes should be revealed and placed in Hero zones
		const heroDefinition = this.placeHeroInZone(playerId, deckDefs);

		// Rule 4.1.i: Shuffle deck (with remaining cards)
		this.initializePlayerDeck(playerId, deckDefs, heroDefinition);

		// Rule 4.1.j: Draw 6 cards
		await this.drawCards(playerId, 6);

		// Rule 4.1.k: Start with 3 Mana Orbs face-down and ready from hand
		await this.initializeManaOrbsFromHand(playerId);

		// Rule 4.1: Initialize expedition state
		player.expeditionState = {
			heroPosition: 0,
			companionPosition: 0,
			heroActive: true,
			companionActive: true,
			heroMovedThisTurn: false,
			companionMovedThisTurn: false,
			heroStats: { forest: 0, mountain: 0, water: 0 },
			companionStats: { forest: 0, mountain: 0, water: 0 }
		};
	}

	private placeHeroInZone(playerId: string, deckDefs: ICardDefinition[]): ICardDefinition {
		const player = this.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found for hero placement.`);

		const heroDefinition = deckDefs.find(def => def.type === CardType.Hero);
		if (!heroDefinition) {
			throw new Error(`No Hero card found in deck for player ${playerId}.`);
		}

		// Create and place the hero object
		const heroObject = this.objectFactory.createGameObjectFromDefinition(heroDefinition, playerId);
		// heroObject.faceDown = false; // Heroes are revealed (ObjectFactory should handle this based on card type)
		player.zones.heroZone.add(heroObject);
		console.log(`[GSM] Placed Hero ${heroDefinition.name} for player ${playerId}.`);
		return heroDefinition; // Return the definition so it can be excluded from the deck
	}

	private initializePlayerDeck(playerId: string, deckDefs: ICardDefinition[], heroToExclude?: ICardDefinition): void {
		const player = this.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found for deck initialization.`);

		const deckZone = player.zones.deckZone as DeckZone;
		deckZone.clear(); // Clear any existing cards (e.g., from previous test setups)

		const cardsForDeck = deckDefs.filter(def => def !== heroToExclude && def.type !== CardType.Hero);

		if (cardsForDeck.length === 0) {
			console.warn(`[GSM] Player ${playerId} has no non-hero cards in their deck list.`);
		}

		cardsForDeck.forEach((def) => {
			const cardInstance = this.objectFactory.createCardInstance(def.id, playerId);
			deckZone.add(cardInstance);
		});

		deckZone.shuffle();
		console.log(`[GSM] Initialized and shuffled deck for player ${playerId} with ${deckZone.getCount()} cards.`);
	}

	private async initializeManaOrbsFromHand(playerId: string): Promise<void> {
		const player = this.getPlayer(playerId);
		if (!player) {
			console.error(`[GSM] Player ${playerId} not found for mana orb initialization.`);
			return;
		}

		const handZone = player.zones.handZone;
		const manaZone = player.zones.manaZone;
		const cardsToSelectFrom = handZone.getAll().filter(isGameObject); // Ensure we are working with GameObjects

		if (cardsToSelectFrom.length < 3) {
			console.warn(`[GSM] Player ${playerId} has fewer than 3 cards in hand (${cardsToSelectFrom.length}) to choose for mana orbs. Taking all available.`);
			// Take all available cards from hand if less than 3
			for (const card of cardsToSelectFrom) {
				const manaOrb = this.moveEntity(card.objectId, handZone, manaZone, playerId) as IGameObject;
				if (manaOrb) {
					manaOrb.faceDown = true;
					manaOrb.type = CardType.ManaOrb; // Rule 3.2.9.c
					manaOrb.statuses.delete(StatusType.Exhausted); // Ready
					// Note: Full characteristic wipe as per Rule 3.2.9.c (losing abilities, stats etc.)
					// should ideally be handled by moveEntity or ObjectFactory when type changes to ManaOrb
					// or upon entering ManaZone designated for such orbs.
				}
			}
			console.log(`[GSM] Initialized ${cardsToSelectFrom.length} mana orbs for player ${playerId} from hand.`);
			return;
		}

		// Placeholder for player choice: select the first 3 cards from hand.
		// In a real implementation, this would involve:
		// const chosenCardIds = await this.actionHandler.playerChoosesCards(playerId, cardsToSelectFrom.map(c => c.objectId), 3, 'Select 3 cards for Mana Orbs');
		// const cardsToBecomeManaOrbs = cardsToSelectFrom.filter(c => chosenCardIds.includes(c.objectId));
		// For now, picking the first three:
		const cardsToBecomeManaOrbs = cardsToSelectFrom.slice(0, 3);

		for (const card of cardsToBecomeManaOrbs) {
			const manaOrb = this.moveEntity(card.objectId, handZone, manaZone, playerId) as IGameObject;
			if (manaOrb) {
				manaOrb.faceDown = true;
				manaOrb.type = CardType.ManaOrb; // Rule 3.2.9.c
				manaOrb.statuses.delete(StatusType.Exhausted); // Ready
				// Again, note characteristic wipe (Rule 3.2.9.c) is a deeper concern for moveEntity/ObjectFactory.
			}
		}
		console.log(`[GSM] Initialized 3 mana orbs for player ${playerId} from hand.`);
	}

	private initializeGameState(playerIds: string[]): IGameState {
		const players = new Map<string, IPlayer>();

		// Create shared zones first
		const sharedZones = {
			adventure: new GenericZone('shared-adventure', ZoneIdentifier.Adventure, 'visible'),
			expedition: new GenericZone('shared-expedition', ZoneIdentifier.Expedition, 'visible'),
			limbo: new LimboZone()
		};

		playerIds.forEach((pid) => {
			const handZone = new HandZone(`${pid}-hand`, pid);
			const reserveZone = new GenericZone(`${pid}-reserve`, ZoneIdentifier.Reserve, 'visible', pid);
			const discardPileZone = new DiscardPileZone(`${pid}-discard`, pid);

			players.set(pid, {
				id: pid,
				zones: {
					deckZone: new DeckZone(`${pid}-deck`, pid),
					handZone: handZone,
					discardPileZone: discardPileZone,
					manaZone: new GenericZone(`${pid}-mana`, ZoneIdentifier.Mana, 'visible', pid),
					reserveZone: reserveZone,
					landmarkZone: new GenericZone(`${pid}-landmark`, ZoneIdentifier.Landmark, 'visible', pid),
					heroZone: new GenericZone(`${pid}-hero`, ZoneIdentifier.Hero, 'visible', pid),
					limboZone: sharedZones.limbo, // Reference to shared limbo zone
					hand: handZone, // Alias for test compatibility
					reserve: reserveZone, // Alias for test compatibility
					discardPile: discardPileZone // Alias for test compatibility
				},
				heroExpedition: { position: 0, canMove: true, hasMoved: false },
				companionExpedition: { position: 0, canMove: true, hasMoved: false },
				hasPassedTurn: false,
				hasExpandedThisTurn: false,
				currentMana: 0
			});
		});

		return {
			players,
			sharedZones,
			currentPhase: GamePhase.Setup,
			currentPlayerId: playerIds[0],
			firstPlayerId: playerIds[0],
			currentDay: 1,
			dayNumber: 1,
			firstMorningSkipped: false,
			gameEnded: false,
			tiebreakerMode: false,
			actionHistory: []
		};
	}

	public resetExpandFlags(): void {
		for (const player of this.state.players.values()) {
			player.hasExpandedThisTurn = false;
		}
		console.log('[GSM] Reset expand flags for all players.');
	}

	public initializeBoard(
		playerDeckDefinitionsMap: Map<string, ICardDefinition[]>,
		startingHandSize: number,
		initialManaOrbs: number
	) {
		this.state.players.forEach((player, playerId) => {
			const deckDefinitions = playerDeckDefinitionsMap.get(playerId);
			if (!deckDefinitions) {
				return;
			}
			const heroDefinition = deckDefinitions.find((def) => def.type === CardType.Hero);
			if (!heroDefinition) {
				console.error(`Player ${playerId}'s deck must contain exactly one Hero. Hero not found.`);
				return;
			}

			const heroTempInstance = this.objectFactory.createCardInstance(heroDefinition.id, playerId);
			const heroGameObject = this.objectFactory.createGameObject(
				heroTempInstance,
				playerId
			) as IGameObject;

			if (heroDefinition.startingCounters) {
				heroGameObject.counters = new Map(heroDefinition.startingCounters);
			}

			player.zones.heroZone.add(heroGameObject);

			const nonHeroDeckDefinitions = deckDefinitions.filter((def) => def.type !== CardType.Hero);
			const deckCardInstances: ICardInstance[] = nonHeroDeckDefinitions.map((def) => {
				return this.objectFactory.createCardInstance(def.id, playerId);
			});

			const deckZone = player.zones.deck as DeckZone;
			deckCardInstances.forEach((cardInstance) => deckZone.add(cardInstance));
			deckZone.shuffle();

			const topCardInstances = deckZone.getAll().slice(0, initialManaOrbs);

			for (const cardInstance of topCardInstances) {
				const cardId = isGameObject(cardInstance) ? cardInstance.objectId : cardInstance.instanceId;
				const manaObject = this.moveEntity(
					cardId,
					deckZone,
					player.zones.manaZone,
					playerId
				) as IGameObject;

				if (manaObject) {
					manaObject.faceDown = true; // Should be face-down
					manaObject.type = CardType.ManaOrb; // Should become ManaOrb type
					if (manaObject.statuses.has(StatusType.Exhausted)) {
						manaObject.statuses.delete(StatusType.Exhausted); // Initial orbs start ready
					}
				}
			}

			this.drawCards(playerId, startingHandSize);
		});
	}

	public moveEntity(
		entityId: string,
		fromZone: IZone,
		toZone: IZone,
		controllerId: string
	): IGameObject | ICardInstance | null {
		console.log(
			`[GameStateManager.moveEntity] Attempting to move entityId: ${entityId} from zone: ${fromZone.id}`
		);
		console.log(
			`[GameStateManager.moveEntity] Keys in fromZone ${fromZone.id}:`,
			Array.from(fromZone.entities.keys())
		);
		const sourceEntity = fromZone.remove(entityId);
		if (!sourceEntity) {
			console.error(
				`[GameStateManager.moveEntity] Entity ${entityId} really not found in zone ${fromZone.id}.`
			);
			throw new Error(`Entity ${entityId} not found in zone ${fromZone.id}.`);
		}

		const definition = this.getCardDefinition(sourceEntity.definitionId);
		if (!definition) throw new Error(`Definition not found for ${sourceEntity.definitionId}`);

		if (definition.type === CardType.Token && fromZone.zoneType === ZoneIdentifier.Expedition) {
			this.eventBus.publish('entityCeasedToExist', { entity: sourceEntity, from: fromZone });
			return null;
		}

		let finalDestinationZone = toZone;
		if (toZone.ownerId && toZone.ownerId !== sourceEntity.ownerId) {
			const owner = this.getPlayer(sourceEntity.ownerId);
			if (!owner) throw new Error(`Owner ${sourceEntity.ownerId} of entity ${entityId} not found.`);
			const correctZone = Object.values(owner.zones).find((z) => z.zoneType === toZone.zoneType);
			if (!correctZone)
				throw new Error(
					`Cannot find zone of type ${toZone.zoneType} for owner ${sourceEntity.ownerId}`
				);
			finalDestinationZone = correctZone;
		}

		// --- Refined Counter Handling Logic ---
		const countersToKeep = new Map<CounterType, number>();
		const sourceGameObject = isGameObject(sourceEntity) ? sourceEntity : undefined;

		if (sourceGameObject) {
			const isMovingToDiscardPile = finalDestinationZone.zoneType === ZoneIdentifier.DiscardPile;
			const isMovingToHiddenZone = finalDestinationZone.visibility === 'hidden'; // e.g., Hand or Deck

			// Rule 2.5.j: "Unless specified otherwise, objects lose all their counters when they leave play zones."
			// "Play zones" are Expedition and Landmark zones.
			// Rule 2.5.k: "Objects moving from Reserve or Limbo to another zone keep their counters unless they are moved to a discard pile."
			// Rule 7.4.6.b (Seasoned): "When a Seasoned Character moves from an expedition to its owner’s Reserve, it keeps all its Boost counters."

			if (isMovingToDiscardPile || isMovingToHiddenZone) {
				// No counters are kept if moving to Discard Pile or a hidden zone (Hand/Deck).
				// This covers the exception in 2.5.k and general behavior for hidden zones.
				console.log(`[GSM.moveEntity] ${sourceGameObject.name} moving to Discard/Hidden zone, all counters lost.`);
			} else {
				// Not moving to Discard Pile or a Hidden Zone, so counters might be kept.
				const fromReserve = fromZone.zoneType === ZoneIdentifier.Reserve;
				const fromLimbo = fromZone.zoneType === ZoneIdentifier.Limbo;
				const fromExpedition = fromZone.zoneType === ZoneIdentifier.Expedition;
				const fromLandmark = fromZone.zoneType === ZoneIdentifier.Landmark; // Typically objects don't move *from* Landmark with counters other than by effects

				const toReserve = finalDestinationZone.zoneType === ZoneIdentifier.Reserve;

				if (fromReserve || fromLimbo) {
					// Rule 2.5.k: Objects from Reserve/Limbo keep counters (unless going to discard/hidden - handled above)
					for (const [type, amount] of sourceGameObject.counters.entries()) {
						countersToKeep.set(type, amount);
					}
					console.log(`[GSM.moveEntity] ${sourceGameObject.name} moving from Reserve/Limbo, keeping all ${countersToKeep.size} types of counters.`);
				} else if (fromExpedition || fromLandmark) {
					// Generally, counters are lost (Rule 2.5.j) unless an exception applies.
					if (toReserve) {
						// Check for Seasoned (Rule 7.4.6.b)
						// Assuming currentCharacteristics.keywords is populated by RuleAdjudicator if available
						const isSeasoned = sourceGameObject.currentCharacteristics?.keywords?.has(KeywordAbility.Seasoned) ||
										   sourceGameObject.abilities.some(a => a.keyword === KeywordAbility.Seasoned);

						if (isSeasoned) {
							const boostCount = sourceGameObject.counters.get(CounterType.Boost);
							if (boostCount && boostCount > 0) {
								countersToKeep.set(CounterType.Boost, boostCount);
								console.log(`[GSM.moveEntity] Seasoned ${sourceGameObject.name} moving to Reserve, keeping ${boostCount} Boost counters.`);
							} else {
								console.log(`[GSM.moveEntity] Seasoned ${sourceGameObject.name} moving to Reserve, but has no Boost counters to keep.`);
							}
							// Other counters on a Seasoned character are lost unless another rule saves them.
						} else {
							console.log(`[GSM.moveEntity] Non-Seasoned ${sourceGameObject.name} moving from Expedition/Landmark to Reserve, losing all counters.`);
						}
					} else {
						// Moving from Expedition/Landmark to a zone other than Reserve, Discard, or Hidden (e.g., another visible zone via an effect)
						// Rule 2.5.j implies counters are lost unless specified otherwise.
						// If moving to Limbo, they *should* keep counters based on typical interpretations,
						// but 2.5.j is about leaving "play zones". Limbo isn't strictly a play zone.
						// However, if Limbo is a temporary holding, keeping counters makes sense.
						// For now, stick to explicit rules: if not to Reserve (Seasoned) or from Reserve/Limbo (general keep), counters are lost.
						console.log(`[GSM.moveEntity] ${sourceGameObject.name} moving from Expedition/Landmark to ${finalDestinationZone.zoneType}, losing all counters (Rule 2.5.j).`);
					}
				} else {
					// Moving from other zones like Mana, Hero zone, etc.
					// Generally, these are not "play zones" in the context of Rule 2.5.j (Expedition/Landmark).
					// And not Reserve/Limbo for 2.5.k.
					// Default behavior here would be to lose counters unless a specific effect or rule states otherwise.
					// This path is less common for objects with counters that are moving.
					console.log(`[GSM.moveEntity] ${sourceGameObject.name} moving from ${fromZone.zoneType}, losing counters by default.`);
				}
			}
		}
		// --- End of Refined Counter Handling Logic ---

		let newEntity: ZoneEntity;
		if (finalDestinationZone.visibility === 'visible') {
			newEntity = this.objectFactory.createGameObject(sourceEntity, controllerId, countersToKeep);
		} else {
			newEntity = isGameObject(sourceEntity)
				? this.objectFactory.createCardInstance(sourceEntity.definitionId, sourceEntity.ownerId)
				: sourceEntity;
		}

		finalDestinationZone.add(newEntity);

		// Process keyword abilities and triggers for the move
		if (isGameObject(newEntity)) {
			this.keywordHandler.processKeywordOnLeavePlay(newEntity, fromZone, finalDestinationZone);
			this.triggerHandler.processMovementTriggers(newEntity, fromZone, finalDestinationZone);
			// After existing handlers, apply passive abilities
			this.ruleAdjudicator.applyAllPassiveAbilities();
		}

		this.eventBus.publish('entityMoved', {
			entity: newEntity,
			from: fromZone,
			to: finalDestinationZone
		});
		return newEntity;
	}

	public getCardDefinition(id: string): ICardDefinition | undefined {
		return this.allCardDefinitions.get(id); // Corrected to use allCardDefinitions
	}

	public getObject(id: string): IGameObject | undefined {
		for (const zone of this.getAllVisibleZones()) {
			const entity = zone.findById(id);
			if (entity && isGameObject(entity)) {
				return entity;
			}
		}
		return undefined;
	}

	public findZoneOfObject(objectId: string): IZone | undefined {
		for (const zone of this.getAllVisibleZones()) {
			if (zone.findById(objectId)) {
				return zone;
			}
		}
		return undefined;
	}

	private *getAllVisibleZones(): Generator<IZone> {
		for (const player of this.state.players.values()) {
			yield player.zones.discardPileZone; // Corrected: discardPile -> discardPileZone
			yield player.zones.manaZone;
			yield player.zones.reserveZone;    // Corrected: reserve -> reserveZone (using the primary, not alias)
			yield player.zones.landmarkZone;
			yield player.zones.heroZone;
		}
		yield this.state.sharedZones.adventure;
		yield this.state.sharedZones.expedition;
		yield this.state.sharedZones.limbo;
	}

	public getPlayer(id: string): IPlayer | undefined {
		return this.state.players.get(id);
	}

	public getPlayerIds(): string[] {
		return Array.from(this.state.players.keys());
	}

	public setCurrentPhase(phase: GamePhase) {
		this.state.currentPhase = phase;
		this.eventBus.publish('phaseChanged', { phase });

		// Process "At [Phase]" triggers
		this.triggerHandler.processPhaseTriggersForPhase(phase);
		await this.resolveReactions();
	}

	public getPlayerIdsInInitiativeOrder(startingPlayerId: string): string[] {
		const playerIds = Array.from(this.state.players.keys());
		const startIndex = playerIds.indexOf(startingPlayerId);
		if (startIndex === -1) {
			console.warn(`[GSM] startingPlayerId ${startingPlayerId} not found in playerIds. Defaulting to full list.`);
			return playerIds; // Should not happen with valid startingPlayerId
		}
		return [...playerIds.slice(startIndex), ...playerIds.slice(0, startIndex)];
	}

	public async resolveReactions(): Promise<void> {
		console.log('[GameStateManager] resolveReactions called. Delegating to ReactionManager.processReactions...');
		// The ReactionManager.checkForTriggers should be called by the EventBus or specific game event handlers
		// right before resolveReactions might be needed.
		// For example, an event like 'afterEffectResolved' or 'cardPlayed' could trigger 'checkForTriggers',
		// then 'resolveReactions' is called to process them.
		// PhaseManager and TurnManager will call this method at appropriate times (e.g., end of a step, after an action).
		await this.reactionManager.processReactions();
		console.log('[GameStateManager] ReactionManager.processReactions finished.');
	}

	/**
	 * Sets the game winner and ends the game
	 */
	public setGameWinner(playerId: string): void {
		this.state.gameEnded = true;
		this.state.winner = playerId;
		console.log('[GSM] Game ended, winner:', playerId);
	}

	/**
	 * Enters tiebreaker mode according to Rule 4.3
	 */
	public enterTiebreakerMode(): void {
		this.state.tiebreakerMode = true;

		// Rule 4.3.e: Replace adventure with Arena containing all terrain types
		const adventureZone = this.state.sharedZones.adventure;
		adventureZone.clear();

		// Arena has V, M, O terrain regions
		const arenaRegions = [
			{
				id: 'arena-forest',
				instanceId: 'arena-forest',
				type: 'ArenaRegion',
				terrainType: 'forest',
				ownerId: 'shared'
			},
			{
				id: 'arena-mountain',
				instanceId: 'arena-mountain',
				type: 'ArenaRegion',
				terrainType: 'mountain',
				ownerId: 'shared'
			},
			{
				id: 'arena-water',
				instanceId: 'arena-water',
				type: 'ArenaRegion',
				terrainType: 'water',
				ownerId: 'shared'
			}
		];

		arenaRegions.forEach((region) => {
			adventureZone.add(region as ZoneEntity);
		});

		console.log('[GSM] Tiebreaker mode started');
	}

	/**
	 * Moves a card between zones with validation
	 */
	public moveCard(
		cardId: string,
		fromZone: ZoneIdentifier,
		toZone: ZoneIdentifier,
		playerId: string
	): void {
		const player = this.getPlayer(playerId);
		if (!player) {
			throw new Error(`Player ${playerId} not found`);
		}

		const fromZoneObj = this.getZoneByIdentifier(fromZone, playerId);
		const toZoneObj = this.getZoneByIdentifier(toZone, playerId);

		if (!fromZoneObj || !toZoneObj) {
			throw new Error('Invalid zone identifier');
		}

		const card = fromZoneObj.getAll().find((c) => c.id === cardId);
		if (!card) {
			throw new Error(`Card ${cardId} not found in ${fromZone}`);
		}

		this.moveEntity(cardId, fromZoneObj, toZoneObj, playerId);
	}

	private getZoneByIdentifier(zoneId: ZoneIdentifier, playerId: string): IZone | undefined {
		const player = this.getPlayer(playerId);
		if (!player) return undefined;

		switch (zoneId) {
			case ZoneIdentifier.Hand:
				return player.zones.handZone;
			case ZoneIdentifier.Deck:
				return player.zones.deckZone;
			case ZoneIdentifier.Discard:
				return player.zones.discardPileZone;
			case ZoneIdentifier.Mana:
				return player.zones.manaZone;
			case ZoneIdentifier.Reserve:
				return player.zones.reserveZone;
			case ZoneIdentifier.Landmark:
				return player.zones.landmarkZone;
			case ZoneIdentifier.Hero:
				return player.zones.heroZone;
			case ZoneIdentifier.Expedition:
				return this.state.sharedZones.expedition;
			case ZoneIdentifier.Limbo:
				return this.state.sharedZones.limbo;
			case ZoneIdentifier.Adventure:
				return this.state.sharedZones.adventure;
			default:
				return undefined;
		}
	}

	/**
	 * Handles the Prepare daily effect during the Morning phase.
	 * Rule 4.2.1.c: Readies all exhausted cards and objects.
	 */
	public async preparePhase(): Promise<void> {
		console.log('[GSM] Beginning Prepare phase (daily effects).');
		this.resetExpandFlags(); // Rule 4.2.1.e - reset before expand step
		this.statusHandler.processStatusEffectsDuringPhase('morning'); // Readies objects etc.

		// Reset ability activation counts for "Nothing is Forever" rule (Rule 1.4.6)
		console.log('[GSM] Resetting daily ability activation counts for QuickActions and Reactions.');
		for (const zone of this.getAllVisibleZones()) {
			for (const entity of zone.getAll()) {
				if (isGameObject(entity)) {
					// Reset QuickAction activations (Rule 1.4.6.b)
					if (entity.abilityActivationsToday) {
						entity.abilityActivationsToday.clear();
					} else {
						entity.abilityActivationsToday = new Map<string, number>();
					}

					// Reset Reaction activations (Rule 1.4.6.c) for base abilities
					if (entity.abilities) {
						for (const ability of entity.abilities) {
							ability.reactionActivationsToday = 0;
						}
					}
					// Reset Reaction activations for granted abilities
					if (entity.currentCharacteristics?.grantedAbilities) {
						for (const grantedAbility of entity.currentCharacteristics.grantedAbilities) {
							grantedAbility.reactionActivationsToday = 0;
						}
					}
				}
			}
		}
		// Note: The original duplicate preparePhase method at the end of the file should be reviewed/removed if redundant.
		// Also, ensure RuleAdjudicator applies passives *after* this reset if any passives affect activation limits.
		// For now, this direct reset is done first.
	}

	/**
	 * Handles the Rest daily effect during the Night phase.
	 * Rule 4.2.5.b
	 */
	public async restPhase() {
		console.log('[GSM] Beginning Rest phase.');
		const expeditionZone = this.state.sharedZones.expedition;

		for (const player of this.state.players.values()) {
			const playerEntitiesInExpedition = expeditionZone.getAll().filter((e): e is IGameObject =>
				isGameObject(e) && e.controllerId === player.id &&
				(e.type === CardType.Character || e.type === CardType.Gear) // Assuming Gear can also be in expeditions
			);

			for (const entity of playerEntitiesInExpedition) {
				let isAffectedByMovingExpedition = false;
				// Rule 7.4.4: Gigantic characters are affected if EITHER expedition moved.
				// isGigantic should be reliably set by RuleAdjudicator on currentCharacteristics.
				const isGigantic = entity.currentCharacteristics.isGigantic === true;

				if (isGigantic) {
					if (player.heroExpedition.hasMoved || player.companionExpedition.hasMoved) {
						isAffectedByMovingExpedition = true;
						console.log(`[GSM] Gigantic entity ${entity.name} is affected by expedition movement.`);
					}
				} else {
					// Non-Gigantic: check specific expedition assignment
					// Assumes CardPlaySystem sets entity.expeditionAssignment
					if (
						entity.expeditionAssignment === 'hero' &&
						player.heroExpedition.hasMoved
					) {
						isAffectedByMovingExpedition = true;
						console.log(
							`[GSM] Entity ${entity.name} in hero expedition is affected by hero movement.`
						);
					} else if (
						entity.expeditionAssignment === 'companion' &&
						player.companionExpedition.hasMoved
					) {
						isAffectedByMovingExpedition = true;
						console.log(
							`[GSM] Entity ${entity.name} in companion expedition is affected by companion movement.`
						);
					} else if (!entity.expeditionAssignment && (player.heroExpedition.hasMoved || player.companionExpedition.hasMoved)) {
						// Fallback for entities without explicit assignment (e.g. older system state or if CardPlaySystem hasn't set it)
						// This maintains previous behavior for unassigned entities if ANY expedition moved.
						// Ideally, all non-Gigantic entities in expeditionZone should have expeditionAssignment.
						console.warn(`[GSM] Entity ${entity.name} lacks expeditionAssignment, using anyExpeditionMoved logic.`);
						isAffectedByMovingExpedition = true;
					}
				}

				if (isAffectedByMovingExpedition) {
					// Use status handler to check all status interactions
					const statusResults = this.statusHandler.checkStatusInteraction(entity, 'rest');

					// Check if status effects prevent going to Reserve (Rule 2.4.1 Anchored, 2.4.3 Asleep)
					if (statusResults.anchored || statusResults.asleep) {
						console.log(
							`[GSM] Entity ${entity.name} not moved to Reserve due to Anchored/Asleep.`
						);
						continue;
					}

					// Check for Eternal keyword (Rule 7.4.3)
					if (this.keywordHandler.isEternal(entity)) {
						console.log(`[GSM] Eternal entity ${entity.name} not moved to Reserve.`);
						continue;
					}

					// Determine destination: Reserve or Discard (if Fleeting, Rule 2.4.5)
					let destinationZone;
					if (statusResults.fleetingDestination === 'discard') {
						destinationZone = player.zones.discardPileZone;
						console.log(`[GSM] Fleeting entity ${entity.name} to be moved to Discard.`);
					} else {
						destinationZone = player.zones.reserveZone;
						console.log(`[GSM] Entity ${entity.name} to be moved to Reserve.`);
					}

					this.moveEntity(entity.objectId, expeditionZone, destinationZone, entity.controllerId);
				}
			}
		}
	}

	/**
	 * Handles the Clean-up daily effect during the Night phase.
	 * Rule 4.2.5.c: Players discard/sacrifice down to their limits.
	 */
	public async cleanupPhase(): Promise<void> {
		console.log('[GSM] Beginning Clean-up phase.');
		// Rule 1.4.5.a / 6.1.h: Choices are made in initiative order.
		const playerIdsInOrder = this.getPlayerIdsInInitiativeOrder(this.state.firstPlayerId);

		for (const playerId of playerIdsInOrder) {
			const player = this.getPlayer(playerId);
			if (!player) continue;

			const hero = player.zones.heroZone.getAll().find(obj => isGameObject(obj) && obj.type === CardType.Hero) as IGameObject | undefined;
			// Rule 4.2.5.c: Default limits if hero not found or hero has no specified limits.
			// These defaults (2 for reserve, 2 for landmark) are common, but could also be game constants.
			const reserveLimit = hero?.currentCharacteristics.reserveLimit ?? hero?.baseCharacteristics.reserveLimit ?? 2;
			const landmarkLimit = hero?.currentCharacteristics.landmarkLimit ?? hero?.baseCharacteristics.landmarkLimit ?? 2;

			// --- Reserve Clean-up ---
			const reserveZone = player.zones.reserveZone;
			const reserveObjects = reserveZone.getAll().filter(isGameObject);

			if (reserveObjects.length > reserveLimit) {
				console.log(`[GSM] Player ${playerId} Reserve: ${reserveObjects.length}/${reserveLimit}. Choosing objects to keep.`);
				// PlayerActionHandler returns IDs of objects TO DISCARD
				const objectsToDiscardIds = await this.actionHandler.playerChoosesObjectsToKeep(
					playerId,
					reserveObjects,
					reserveLimit,
					'reserve'
				);
				for (const objectIdToDiscard of objectsToDiscardIds) {
					const objectToDiscard = reserveObjects.find(obj => obj.objectId === objectIdToDiscard);
					if (objectToDiscard) {
						console.log(
							`[GSM] Player ${playerId} discarding ${objectToDiscard.name} (${objectToDiscard.definitionId}) from Reserve.`
						);
						this.moveEntity(
							objectToDiscard.objectId,
							reserveZone,
							player.zones.discardPileZone,
							playerId
						);
					}
				}
			}

			// --- Landmark Clean-up ---
			const landmarkZone = player.zones.landmarkZone;
			const landmarkObjects = landmarkZone.getAll().filter(isGameObject);

			if (landmarkObjects.length > landmarkLimit) {
				console.log(`[GSM] Player ${playerId} Landmark: ${landmarkObjects.length}/${landmarkLimit}. Choosing objects to keep.`);
				// PlayerActionHandler returns IDs of objects TO SACRIFICE (which means discard)
				const objectsToSacrificeIds = await this.actionHandler.playerChoosesObjectsToKeep(
					playerId,
					landmarkObjects,
					landmarkLimit,
					'landmark'
				);
				for (const objectIdToSacrifice of objectsToSacrificeIds) {
					const objectToSacrifice = landmarkObjects.find(obj => obj.objectId === objectIdToSacrifice);
					if (objectToSacrifice) {
						console.log(
							`[GSM] Player ${playerId} sacrificing ${objectToSacrifice.name} (${objectToSacrifice.definitionId}) from Landmark.`
						);
						// Rule 7.3.25.a: "sacrifice ... they have to discard an object in play they control"
						this.moveEntity(
							objectToSacrifice.objectId,
							landmarkZone,
							player.zones.discardPileZone, // Sacrificed cards go to discard pile
							playerId
						);
					}
				}
			}
		}
		console.log('[GSM] Clean-up phase finished.');
	}

	/**
	 * Calculates the terrain statistics for an expedition
	 * Rule 4.2.4, 7.1.2
	 */
	public calculateExpeditionStats(
		playerId: string,
		expeditionType: 'hero' | 'companion' // Renamed _expeditionType
	): ITerrainStats {
		const player = this.getPlayer(playerId);
		if (!player) return { forest: 0, mountain: 0, water: 0 };

		const expeditionZone = this.state.sharedZones.expedition;
		const stats: ITerrainStats = { forest: 0, mountain: 0, water: 0 };

		const allPlayerCharactersInExpedition = expeditionZone.getAll().filter(
			(e): e is IGameObject =>
				isGameObject(e) &&
				e.controllerId === playerId &&
				e.type === CardType.Character
		);

		for (const entity of allPlayerCharactersInExpedition) {
			// Rule 2.4.3.a: Asleep characters' stats are not counted.
			// Check currentCharacteristics for asleep status if RuleAdjudicator sets it there,
			// otherwise entity.statuses is fine. Assuming entity.statuses is up-to-date.
			if (entity.statuses.has(StatusType.Asleep)) {
				continue;
			}

			const characteristics = entity.currentCharacteristics;
			const isGigantic = characteristics.isGigantic === true; // Rule 7.4.4.e

			let countThisEntity = false;
			if (isGigantic) {
				// Gigantic characters count in EACH of their controller's expeditions.
				// So, they are always included if this function is called for their controller.
				countThisEntity = true;
			} else {
				// Non-Gigantic characters count only if assigned to the specific expeditionType.
				if (
					entity.expeditionAssignment?.playerId === playerId &&
					entity.expeditionAssignment?.type === expeditionType
				) {
					countThisEntity = true;
				}
			}

			if (countThisEntity) {
				const entityStats = characteristics.statistics;
				if (entityStats) {
					stats.forest += entityStats.forest || 0;
					stats.mountain += entityStats.mountain || 0;
					stats.water += entityStats.water || 0;
				}

				// Rule 2.5.1.b: Add boost counters
				const boostCount = entity.counters.get(CounterType.Boost) || 0;
				if (boostCount > 0) { // Only add if there are boost counters
					stats.forest += boostCount;
					stats.mountain += boostCount;
					stats.water += boostCount;
				}
			}
		}
		return stats;
	}

	/**
	 * Handles the Progress daily effect during Dusk phase
	 * Rule 4.2.4.c-j
	 */
	public async progressPhase(): Promise<void> {
		console.log('[GSM] Beginning Progress phase.');

		for (const player of this.state.players.values()) {
			// Reset movement flags
			player.heroExpedition.hasMoved = false;
			player.companionExpedition.hasMoved = false;
			player.heroExpedition.canMove = true;
			player.companionExpedition.canMove = true;

			// Check for Defender keyword (Rule 7.4.2)
			const movementRestrictions = this.keywordHandler.checkDefenderRestrictions(player.id);
			player.heroExpedition.canMove = movementRestrictions.hero;
			player.companionExpedition.canMove = movementRestrictions.companion;

			// Corrected logic: if BOTH expeditions cannot move, then continue.
			// Original logic was: if (player.heroExpedition.canMove || player.companionExpedition.canMove) { ... }
			// which meant if EITHER could move, it would proceed. We want to skip if BOTH are blocked.
			if (!player.heroExpedition.canMove && !player.companionExpedition.canMove) {
				console.log(`[GSM] Player ${player.id}'s hero and companion expeditions cannot move (e.g. due to Defender).`);
				continue; // Skip this player if both expeditions are blocked
			}


			// Calculate expedition statistics
			const heroStats = this.calculateExpeditionStats(player.id, 'hero');
			const companionStats = this.calculateExpeditionStats(player.id, 'companion');

			const adventureRegions = this.state.sharedZones.adventure.getAll(); // Assuming ordered: H, T1, T2, T3, C
			const totalRegions = adventureRegions.length;

			// Find opponent (for 2-player game)
			const opponents = Array.from(this.state.players.values()).filter((p) => p.id !== player.id);

			for (const opponent of opponents) {
				const oppHeroStats = this.calculateExpeditionStats(opponent.id, 'hero');
				const oppCompanionStats = this.calculateExpeditionStats(opponent.id, 'companion');

				// Hero expedition
				if (player.heroExpedition.canMove) {
					const currentHeroPos = player.heroExpedition.position;
					if (currentHeroPos < totalRegions) {
						const targetHeroRegion = adventureRegions[currentHeroPos];
						const heroRegionTerrains = targetHeroRegion?.terrains || [];
						const heroMovementResult = this.expeditionShouldMove(heroStats, oppHeroStats, heroRegionTerrains);

						if (heroMovementResult.shouldMove) {
							player.heroExpedition.position++;
							player.heroExpedition.hasMoved = true;
							console.log(
								`[GSM] Player ${player.id} hero expedition moved to position ${player.heroExpedition.position} (into region ${targetHeroRegion?.id || 'unknown'}) due to terrain(s): ${heroMovementResult.qualifyingTerrains.join(', ')}.`
							);
						}
					}
				}

				// Companion expedition
				if (player.companionExpedition.canMove) {
					const currentCompanionPos = player.companionExpedition.position;
					if (currentCompanionPos < totalRegions) {
						const targetCompanionRegionIndex = totalRegions - 1 - currentCompanionPos;
						const targetCompanionRegion = adventureRegions[targetCompanionRegionIndex];
						const companionRegionTerrains = targetCompanionRegion?.terrains || [];
						const companionMovementResult = this.expeditionShouldMove(companionStats, oppCompanionStats, companionRegionTerrains);

						if (companionMovementResult.shouldMove) {
							player.companionExpedition.position++;
							player.companionExpedition.hasMoved = true;
							console.log(
								`[GSM] Player ${player.id} companion expedition moved to position ${player.companionExpedition.position} (into region ${targetCompanionRegion?.id || 'unknown'}) due to terrain(s): ${companionMovementResult.qualifyingTerrains.join(', ')}.`
							);
						}
					}
				}
			}
		}
	}

	/**
	 * Determines if an expedition should move forward based on statistics comparison
	 * Rule 4.2.4.e: "An expedition moves forward if it has a greater positive total for at least one terrain"
	 *             that is present in the region.
	 */
	private expeditionShouldMove(
		myStats: ITerrainStats,
		opponentStats: ITerrainStats,
		regionTerrains: string[]
	): { shouldMove: boolean; qualifyingTerrains: (keyof ITerrainStats)[] } {
		const terrainsToCompare: (keyof ITerrainStats)[] = ['forest', 'mountain', 'water'];
		const qualifyingTerrains: (keyof ITerrainStats)[] = [];

		for (const terrain of terrainsToCompare) {
			if (regionTerrains.includes(terrain)) {
				const myStatValue = Math.max(0, myStats[terrain] || 0);
				const opponentStatValue = Math.max(0, opponentStats[terrain] || 0);

				if (myStatValue > 0 && myStatValue > opponentStatValue) {
					qualifyingTerrains.push(terrain);
				}
			}
		}
		return { shouldMove: qualifyingTerrains.length > 0, qualifyingTerrains };
	}

	public async drawCards(playerId: string, count: number): Promise<void> {
		const player = this.getPlayer(playerId);
		if (!player) {
			return;
		}

		const deck = player.zones.deckZone as DeckZone;
		const hand = player.zones.handZone;
		const discardPile = player.zones.discardPileZone;

		for (let i = 0; i < count; i++) {
			if (deck.getCount() === 0) {
				if (discardPile.getCount() > 0) {
					const discardedEntities = discardPile.getAll();
					discardedEntities.forEach((e) => {
						const entityId = isGameObject(e) ? e.objectId : e.instanceId;
						discardPile.remove(entityId);
					});

					const cardsToReshuffle: ICardInstance[] = discardedEntities.map((e) => {
						return isGameObject(e)
							? this.objectFactory.createCardInstance(e.definitionId, e.ownerId)
							: (e as ICardInstance);
					});

					deck.addBottom(cardsToReshuffle);
					deck.shuffle();
				}
			}

			if (deck.getCount() === 0) {
				break;
			}

			const cardToDraw = deck.removeTop();
			if (cardToDraw) {
				// Convert to game object when moving to visible zone (hand)
				const gameObject = this.objectFactory.createGameObject(cardToDraw, playerId);
				gameObject.faceDown = false; // Cards in hand are face-up for owner
				hand.add(gameObject);
				this.eventBus.publish('entityMoved', { entity: gameObject, from: deck, to: hand });
			}
		}
	}

	/**
	 * Get all visible zones across all players and shared zones
	 */
	// Removed duplicate implementation of getAllVisibleZones

	/**
	 * Checks victory conditions after Night phase
	 * Rule 4.2.5.d, 4.3 - Victory and tiebreaker conditions
	 */
	public checkVictoryConditions(): string | null {
		console.log('[GSM] Checking victory conditions.');

		// Check if we're in tiebreaker mode
		if (this.tiebreakerSystem.isInTiebreakerMode()) {
			return this.tiebreakerSystem.processTiebreakerProgress();
		}

		// Normal victory condition check with tiebreaker support
		return this.tiebreakerSystem.checkForTiebreaker();
	}

	// Removed the duplicate calculateExpeditionStats method. The one above is now the consolidated version.

	/**
	 * Find a card in any zone by instance ID
	 */
	public findCardInAnyZone(instanceId: string, preferredZone?: ZoneIdentifier): IGameObject | ICardInstance | undefined {
		// First check preferred zone if specified
		if (preferredZone) {
			for (const player of this.state.players.values()) {
				const zone = this.getZoneByIdentifier(player, preferredZone);
				if (zone) {
					const found = zone.findById(instanceId);
					if (found) return found;
				}
			}
		}

		// Check all zones
		for (const zone of this.getAllVisibleZones()) {
			const found = zone.findById(instanceId);
			if (found) return found;
		}

		// Check hidden zones (hand, deck) - they contain ICardInstance
		for (const player of this.state.players.values()) {
			const handCard = player.zones.handZone.findById(instanceId);
			if (handCard) return handCard;
			
			const deckCard = player.zones.deckZone.findById(instanceId);
			if (deckCard) return deckCard;
		}

		return undefined;
	}

	/**
	 * Retrieves all game objects within a specific conceptual expedition (hero or companion) for a given player.
	 * This includes Gigantic characters of that player, as they are considered part of both.
	 * @param playerId The ID of the player.
	 * @param type The type of expedition ('hero' or 'companion').
	 * @returns An array of IGameObject arrays.
	 */
	public getObjectsInExpedition(playerId: string, type: 'hero' | 'companion'): IGameObject[] {
		const expeditionZone = this.state.sharedZones.expedition;
		return expeditionZone.getAll().filter((obj): obj is IGameObject => {
			if (!isGameObject(obj) || obj.controllerId !== playerId) {
				return false;
			}
			// Gigantic characters count for both hero and companion expeditions of their controller.
			// Rule 7.4.4.a: "A Gigantic Character is considered to be in both its controller’s Hero expedition and Companion expedition simultaneously."
			if (obj.currentCharacteristics?.isGigantic) {
				return true;
			}
			// Non-Gigantic characters must match the specified expedition type.
			return obj.expeditionAssignment?.type === type;
		});
	}

	/**
	 * Get zone by identifier for a player
	 */
	private getZoneByIdentifier(player: IPlayer, zoneId: ZoneIdentifier): IZone | undefined {
		switch (zoneId) {
			case ZoneIdentifier.Hand:
				return player.zones.handZone;
			case ZoneIdentifier.Reserve:
				return player.zones.reserveZone;
			case ZoneIdentifier.Expedition:
				return this.state.sharedZones.expedition;
			case ZoneIdentifier.DiscardPile:
				return player.zones.discardPileZone;
			case ZoneIdentifier.Mana:
				return player.zones.manaZone;
			case ZoneIdentifier.Landmark:
				return player.zones.landmarkZone;
			case ZoneIdentifier.Hero:
				return player.zones.heroZone;
			case ZoneIdentifier.Limbo:
				return this.state.sharedZones.limbo;
			case ZoneIdentifier.Adventure:
				return this.state.sharedZones.adventure;
			default:
				return undefined;
		}
	}

	/**
	 * Play a card from hand with options
	 */
	public async playerPlaysCardFromHand(
		playerId: string, 
		cardInstanceId: string, 
		options?: {
			useAlternativeCostKeyword?: KeywordAbility;
			fromZone?: ZoneIdentifier;
			targetObjectIds?: string[];
		}
	): Promise<{ success: boolean; error?: string }> {
		console.log(`[GSM] Player ${playerId} plays card ${cardInstanceId} with options:`, options);
		
		// For now, return success - full implementation would involve CardPlaySystem
		return { success: true };
	}

	/**
	 * Activate an ability on an object
	 */
	public async playerActivatesAbility(
		playerId: string,
		objectId: string,
		abilityId: string
	): Promise<{ success: boolean; error?: string }> {
		console.log(`[GSM] Player ${playerId} activates ability ${abilityId} on ${objectId}`);
		
		// For now, return success - full implementation would involve ability resolution
		return { success: true };
	}

	/**
	 * Add aliases for test compatibility
	 */
	public get cardDataRepository() {
		return {
			getCardDefinition: (id: string) => this.getCardDefinition(id)
		};
	}

	public get statusUpdater() {
		return {
			updateObjectStatusBasedOnCounters: async (obj: IGameObject) => {
				this.statusHandler.updateBoostedStatus(obj);
			}
		};
	}

	public get zones() {
		return {
			addToZone: (obj: IGameObject, zoneId: ZoneIdentifier, playerId: string) => {
				const player = this.getPlayer(playerId);
				if (!player) return;
				
				const zone = this.getZoneByIdentifier(player, zoneId);
				if (zone) {
					zone.add(obj);
				}
			}
		};
	}

	/**
	 * Prepare phase - ready all exhausted cards
	 * Rule 4.2.1.c
	 */
	// Removed duplicate preparePhase method, the one earlier in the file is primary.

	/**
	 * Add missing properties that tests expect
	 */
	public get currentPhase(): GamePhase {
		return this.state.currentPhase;
	}

	public set currentPhase(phase: GamePhase) {
		this.state.currentPhase = phase;
	}

	public get activePlayerId(): string {
		return this.state.currentPlayerId;
	}

	public set activePlayerId(playerId: string) {
		this.state.currentPlayerId = playerId;
	}

	/**
	 * Gets the maximum valid position index for an expedition on the adventure track.
	 * This depends on the number of regions in the adventure zone.
	 * E.g., if 5 regions (H, T1, T2, T3, C), max position is 4.
	 * An expedition at position 'p' means it has cleared 'p' regions.
	 * The next region it would enter is at index 'p' of the adventureRegions array.
	 * So, if it has cleared all regions, its position would be adventureRegions.length.
	 * However, "position" might be better interpreted as the index of the region it is *about to enter* or *is currently in after moving*.
	 * If position is 0-indexed current region, then max position is length-1.
	 * If position means "slots moved", then it can go up to length.
	 * Based on current `progressPhase` logic: `adventureRegions[currentHeroPos]`,
	 * if currentHeroPos can go up to `totalRegions -1` to enter the last region, then maxPos should be `totalRegions -1`.
	 * If an expedition has position `totalRegions -1`, it means it's in the last region.
	 * Let's assume position is the index of the region an expedition is currently in or has last entered.
	 * So, for 5 regions (indices 0-4), max position is 4.
	 */
	public getAdventureMaxPosition(): number {
		// Assuming adventureRegions are ordered and represent the track.
		// If there are N regions, valid positions are 0 to N-1.
		const adventureRegions = this.state.sharedZones.adventure.getAll();
		return Math.max(0, adventureRegions.length - 1);
	}

	/**
	 * Handles the Resupply keyword action for a player.
	 * Moves the top card of the deck to reserve. If deck is empty, shuffles discard into deck first.
	 * Returns the IGameObject moved to reserve, or null if no card could be moved.
	 * Rule 7.3.22
	 */
	public async resupplyPlayer(playerId: string): Promise<IGameObject | null> {
		const player = this.getPlayer(playerId);
		if (!player) {
			console.warn(`[GSM.resupplyPlayer] Player ${playerId} not found.`);
			return null;
		}

		const deckZone = player.zones.deckZone as DeckZone; // Cast to DeckZone for shuffle method
		const discardPileZone = player.zones.discardPileZone;
		const reserveZone = player.zones.reserveZone;

		if (deckZone.getCount() === 0) {
			if (discardPileZone.getCount() > 0) {
				console.log(`[GSM.resupplyPlayer] Player ${playerId} deck empty. Reshuffling discard pile.`);
				const discardedEntities = discardPileZone.getAll();
				// Important: Clear the discard pile *before* adding cards back to deck,
				// especially if createCardInstance might refer to the original entity temporarily.
				discardedEntities.forEach(e => discardPileZone.remove(isGameObject(e) ? e.objectId : e.instanceId));

				const cardsToReshuffle: ICardInstance[] = discardedEntities.map(e => {
					// Ensure we're creating fresh instances for the deck
					return this.objectFactory.createCardInstance(e.definitionId, e.ownerId);
				});

				deckZone.addBottom(cardsToReshuffle); // Add to bottom then shuffle
				deckZone.shuffle();
				this.eventBus.publish('deckReshuffled', { playerId, count: cardsToReshuffle.length });
				console.log(`[GSM.resupplyPlayer] Player ${playerId} reshuffled ${cardsToReshuffle.length} cards from discard to deck.`);
			}
		}

		if (deckZone.getCount() === 0) {
			console.log(`[GSM.resupplyPlayer] Player ${playerId} deck is still empty after attempting reshuffle. Cannot resupply.`);
			return null;
		}

		const cardToMoveInstance = deckZone.removeTop(); // removeTop should return ICardInstance
		if (!cardToMoveInstance) {
			// Should not happen if getCount() > 0, but as a safeguard.
			console.warn(`[GSM.resupplyPlayer] Deck was not empty but failed to remove top card for player ${playerId}.`);
			return null;
		}

		// moveEntity will convert ICardInstance to IGameObject when moving to a visible zone like Reserve.
		const movedObject = this.moveEntity(cardToMoveInstance.instanceId, deckZone, reserveZone, playerId) as IGameObject | null;

		if (movedObject) {
			console.log(`[GSM.resupplyPlayer] Player ${playerId} resupplied ${movedObject.name} (ID: ${movedObject.objectId}) to Reserve.`);
			// Event for card moving to reserve is handled by moveEntity's 'entityMoved'
			// Specific 'cardResupplied' event might be useful if more specific data is needed.
			// this.eventBus.publish('cardResupplied', { playerId, card: movedObject });
		}
		return movedObject;
	}

	public addCounters(objectId: string, type: CounterType, amount: number): void {
		if (amount <= 0) return;
		const object = this.getObject(objectId);
		if (!object) {
			console.warn(`[GSM.addCounters] Object ${objectId} not found.`);
			return;
		}
		object.counters.set(type, (object.counters.get(type) || 0) + amount);
		console.log(`[GSM.addCounters] Added ${amount} ${type} counters to ${object.name} (ID: ${objectId}). Total: ${object.counters.get(type)}`);
		if (type === CounterType.Boost) {
			this.statusHandler.updateBoostedStatus(object);
		}
		this.eventBus.publish('countersChanged', { objectId, type, newAmount: object.counters.get(type) });
	}

	public removeCounters(objectId: string, type: CounterType, amount: number): void {
		if (amount <= 0) return;
		const object = this.getObject(objectId);
		if (!object) {
			console.warn(`[GSM.removeCounters] Object ${objectId} not found.`);
			return;
		}
		const currentAmount = object.counters.get(type) || 0;
		const amountToRemove = Math.min(amount, currentAmount);
		if (amountToRemove > 0) {
			object.counters.set(type, currentAmount - amountToRemove);
			console.log(`[GSM.removeCounters] Removed ${amountToRemove} ${type} counters from ${object.name} (ID: ${objectId}). Remaining: ${object.counters.get(type)}`);
			if (object.counters.get(type) === 0) {
				object.counters.delete(type); // Clean up if zero
			}
			if (type === CounterType.Boost) {
				this.statusHandler.updateBoostedStatus(object);
			}
			this.eventBus.publish('countersChanged', { objectId, type, newAmount: object.counters.get(type) });
		} else {
			console.log(`[GSM.removeCounters] No ${type} counters to remove from ${object.name} (ID: ${objectId}).`);
		}
	}

	public getNextPlayerId(currentPlayerId: string): string {
		const playerIds = Array.from(this.state.players.keys());
		const currentIndex = playerIds.indexOf(currentPlayerId);
		// Ensure the player is found, though in normal operation it always should be.
		if (currentIndex === -1) {
			console.warn(`[GameStateManager.getNextPlayerId] Player ID ${currentPlayerId} not found. Defaulting to the first player.`);
			return playerIds[0];
		}
		const nextIndex = (currentIndex + 1) % playerIds.length;
		return playerIds[nextIndex];
	}

	public async playerChoosesReaction(playerId: string, availableReactions: IEmblemObject[]): Promise<IEmblemObject | null> {
		console.log(`[GameStateManager] Player ${playerId} is choosing a reaction from ${availableReactions.length} available.`);
		if (availableReactions.length === 0) {
			console.log(`[GameStateManager] No reactions available for player ${playerId} to choose from.`);
			return null;
		}
		// In a real UI, player would select one. For now, pick the first.
		// To simulate passing, a UI could return null here (e.g., if player explicitly passes or times out).
		// For this conceptual implementation, we assume the player always picks one if available.
		// To test the "pass" path in ReactionManager, this function would need to sometimes return null.
		// For now, let's make it always pick the first to ensure the main path is tested.
		// Later, this can be: const choice = await this.actionHandler.playerChoosesReaction(playerId, availableReactions);
		const choice = availableReactions[0];
		console.log(`[GameStateManager] Player ${playerId} (conceptually) chose: ${choice.name} (ID: ${choice.objectId})`);
		return choice;
	}
}
