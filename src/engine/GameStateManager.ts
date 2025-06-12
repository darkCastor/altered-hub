import type { IZone } from './types/zones';
import { ObjectFactory } from './ObjectFactory';
import { GamePhase, ZoneIdentifier, StatusType, CardType, CounterType } from './types/enums';
import type { EventBus } from './EventBus';
import { GenericZone, HandZone, DiscardPileZone, LimboZone, DeckZone } from './Zone';
import type { IGameObject } from './types/objects';
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

export class GameStateManager {
	public state: IGameState;
	public objectFactory: ObjectFactory;
	public eventBus: EventBus;
	public keywordHandler: KeywordAbilityHandler;
	public supportHandler: SupportAbilityHandler;
	public triggerHandler: AdvancedTriggerHandler;
	public actionHandler: PlayerActionHandler;
	public effectProcessor: EffectProcessor;
	public statusHandler: StatusEffectHandler;
	public manaSystem: ManaSystem;
	public cardPlaySystem: CardPlaySystem;
	public tiebreakerSystem: TiebreakerSystem;
	// public passiveManager: PassiveAbilityManager; // Removed
	private ruleAdjudicator: RuleAdjudicator;
	public turnManager?: TurnManager; // Will be set by TurnManager
	public phaseManager?: PhaseManager; // Will be set by PhaseManager
	private cardDefinitions: Map<string, ICardDefinition>;

	constructor(playerIds: string[], cardDefinitions: ICardDefinition[], eventBus: EventBus) {
		this.cardDefinitions = new Map(cardDefinitions.map((def) => [def.id, def]));
		this.objectFactory = new ObjectFactory(this.cardDefinitions);
		this.eventBus = eventBus;
		this.keywordHandler = new KeywordAbilityHandler(this);
		this.supportHandler = new SupportAbilityHandler(this);
		this.triggerHandler = new AdvancedTriggerHandler(this);
		this.actionHandler = new PlayerActionHandler(this);
		this.effectProcessor = new EffectProcessor(this);
		this.statusHandler = new StatusEffectHandler(this);
		this.manaSystem = new ManaSystem(this);
		this.cardPlaySystem = new CardPlaySystem(this); // Assuming CardPlaySystem constructor takes (gsm, eventBus)
		this.tiebreakerSystem = new TiebreakerSystem(this);
		// this.passiveManager = new PassiveAbilityManager(this); // Removed
		this.ruleAdjudicator = new RuleAdjudicator(this);
		this.state = this.initializeGameState(playerIds);
	}

	/**
	 * Rule 4.1: Game Setup Phase - Initialize game according to Altered rules
	 */
	public async initializeGame(): Promise<void> {
		if (this.cardDefinitions.size === 0) {
			throw new Error('No card definitions available');
		}

		// Rule 4.1.l: Start on Day 1, skip first Morning phase
		this.state.currentDay = 1;
		this.state.currentPhase = GamePhase.Noon;
		this.state.firstMorningSkipped = true;

		// Rule 4.1.a-c: Initialize adventure zones and regions
		this.initializeAdventureZones();

		// Initialize each player's game state
		for (const [playerId, player] of this.state.players) {
			await this.initializePlayerState(playerId, player);
		}

		// Rule 4.1: Determine first player (simplified for testing)
		this.state.firstPlayerId = Array.from(this.state.players.keys())[0];
		this.state.currentPlayerId = this.state.firstPlayerId;

		// Note: gameInitialized event not in EventPayloads, so skip for now
		console.log('[GSM] Game initialized with players:', Array.from(this.state.players.keys()));
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

	private async initializePlayerState(playerId: string, player: IPlayer): Promise<void> {
		// Rule 4.1.h: Heroes should be revealed and placed in Hero zones
		this.placeHeroInZone(playerId);

		// Rule 4.1.i: Shuffle deck
		this.initializePlayerDeck(playerId);

		// Rule 4.1.j: Draw 6 cards
		await this.drawCards(playerId, 6);

		// Rule 4.1.k: Start with 3 Mana Orbs face-down and ready
		this.initializeManaOrbs(playerId);

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

	private placeHeroInZone(playerId: string): void {
		const player = this.getPlayer(playerId);
		if (!player) return;

		// Find a hero card definition
		const heroDefinition = Array.from(this.cardDefinitions.values()).find(
			(def) => def.type === CardType.Hero
		);

		if (heroDefinition) {
			const hero = this.objectFactory.createCard(heroDefinition.id, playerId);
			hero.faceDown = false; // Heroes are revealed
			player.zones.heroZone.add(hero);
		}
	}

	private initializePlayerDeck(playerId: string): void {
		const player = this.getPlayer(playerId);
		if (!player) return;

		// Add some cards to deck for testing
		const cardDefinitions = Array.from(this.cardDefinitions.values())
			.filter((def) => def.type !== CardType.Hero)
			.slice(0, 30); // Take first 30 non-hero cards

		cardDefinitions.forEach((def) => {
			const cardInstance = this.objectFactory.createCardInstance(def.id, playerId);
			player.zones.deckZone.add(cardInstance);
		});
	}

	private initializeManaOrbs(playerId: string): void {
		const player = this.getPlayer(playerId);
		if (!player) return;

		// Rule 4.1.k: 3 Mana Orbs face-down and ready
		for (let i = 0; i < 3; i++) {
			const basicCard = Array.from(this.cardDefinitions.values())[0];
			if (basicCard) {
				const manaOrb = this.objectFactory.createCard(basicCard.id, playerId);
				manaOrb.faceDown = true;
				manaOrb.type = CardType.ManaOrb; // Rule 3.2.9.c
				manaOrb.statuses.delete(StatusType.Exhausted); // Ready
				player.zones.manaZone.add(manaOrb);
			}
		}
	}

	private initializeGameState(playerIds: string[]): IGameState {
		const players = new Map<string, IPlayer>();

		// Create shared zones first
		const sharedZones = {
			adventure: new GenericZone('shared-adventure', ZoneIdentifier.Adventure, 'visible'),
			expedition: new GenericZone(
				'shared-expedition-deprecated',
				ZoneIdentifier.Expedition,
				'visible'
			),
			limbo: new LimboZone()
		};

		playerIds.forEach((pid) => {
			const handZone = new HandZone(`${pid}-hand`, pid);
			const reserveZone = new GenericZone(`${pid}-reserve`, ZoneIdentifier.Reserve, 'visible', pid);
			const expeditionZone = new GenericZone(
				`${pid}-expedition`,
				ZoneIdentifier.Expedition,
				'visible',
				pid
			);

			players.set(pid, {
				id: pid,
				zones: {
					deckZone: new DeckZone(`${pid}-deck`, pid),
					handZone: handZone,
					discardPileZone: new DiscardPileZone(`${pid}-discard`, pid),
					manaZone: new GenericZone(`${pid}-mana`, ZoneIdentifier.Mana, 'visible', pid),
					reserveZone: reserveZone,
					landmarkZone: new GenericZone(`${pid}-landmark`, ZoneIdentifier.Landmark, 'visible', pid),
					heroZone: new GenericZone(`${pid}-hero`, ZoneIdentifier.Hero, 'visible', pid),
					expeditionZone: expeditionZone,
					limboZone: sharedZones.limbo, // Reference to shared limbo zone
					hand: handZone, // Alias for test compatibility
					reserve: reserveZone, // Alias for test compatibility
					expedition: expeditionZone // Alias for test compatibility
				},
				heroExpedition: { position: 0, canMove: true, hasMoved: false },
				companionExpedition: { position: 0, canMove: true, hasMoved: false },
				hasPassedTurn: false,
				hasExpandedThisTurn: false
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

				if (manaObject && manaObject.statuses.has(StatusType.Exhausted)) {
					manaObject.statuses.delete(StatusType.Exhausted);
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

		// --- REPLACE THIS ENTIRE BLOCK ---
		const countersToKeep = new Map<CounterType, number>();
		const sourceGameObject = isGameObject(sourceEntity) ? sourceEntity : undefined;
		const isMovingToLosingZone =
			finalDestinationZone.zoneType === ZoneIdentifier.DiscardPile ||
			finalDestinationZone.visibility === 'hidden';

		if (sourceGameObject && !isMovingToLosingZone) {
			const fromZoneIsExpeditionOrLandmark = [
				ZoneIdentifier.Expedition,
				ZoneIdentifier.Landmark
			].includes(fromZone.zoneType);
			const fromZoneIsReserveOrLimbo = [ZoneIdentifier.Reserve, ZoneIdentifier.Limbo].includes(
				fromZone.zoneType
			);

			if (fromZoneIsReserveOrLimbo) {
				// Rule 2.5.k: Objects from Reserve/Limbo keep counters (unless going to discard/hidden)
				for (const [type, amount] of sourceGameObject.counters.entries()) {
					countersToKeep.set(type, amount);
				}
			} else if (fromZoneIsExpeditionOrLandmark) {
				const isMovingToReserve = finalDestinationZone.zoneType === ZoneIdentifier.Reserve;
				// Rule 7.4.6.b: Check for Seasoned keyword when moving to Reserve
				const isSeasoned = sourceGameObject.abilities.some((a) => a.keyword === 'Seasoned');

				if (isSeasoned && isMovingToReserve) {
					const boostCount = sourceGameObject.counters.get(CounterType.Boost);
					if (boostCount && boostCount > 0) {
						countersToKeep.set(CounterType.Boost, boostCount);
					}
				}
			}
		}

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
		return this.cardDefinitions.get(id);
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
			yield player.zones.discardPile;
			yield player.zones.manaZone;
			yield player.zones.reserve;
			yield player.zones.landmarkZone;
			yield player.zones.heroZone;
			yield player.zones.expedition;
		}
		yield this.state.sharedZones.adventure;
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
				return player.zones.expeditionZone;
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
		console.log('[GSM] Beginning Prepare phase.');
		// Use status handler for comprehensive prepare phase processing
		this.statusHandler.processStatusEffectsDuringPhase('morning');
	}

	/**
	 * Handles the Rest daily effect during the Night phase.
	 * Rule 4.2.5.b
	 */
	public async restPhase() {
		console.log('[GSM] Beginning Rest phase.');

		for (const player of this.state.players.values()) {
			const expeditionZone = player.zones.expeditionZone;
			const entitiesToProcess = expeditionZone.getAll().filter((e): e is IGameObject => {
				if (!isGameObject(e)) return false;
				return e.type === CardType.Character || e.type === CardType.Gear;
			});

			for (const entity of entitiesToProcess) {
				let isAffectedByMovingExpedition = false;
				// Rule 7.4.4.a for Gigantic check, or check characteristics if adjudicated
				const isGigantic =
					entity.currentCharacteristics.isGigantic === true ||
					entity.abilities.some((ability) => ability.keyword === KeywordAbility.Gigantic);

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
		// Rule 4.2.5.c: Clean-up - Each player chooses as many objects in their Reserve as
		// their Hero's reserve limit and as many objects in their landmarks as their Hero's
		// landmark limit. All non-selected objects in Reserve are discarded and all non-selected
		// objects in landmarks are sacrificed, simultaneously.
		// Rule 1.4.5.a / 6.1.h: Choices are made in initiative order (current player first, then others).
		// Note on simultaneity: True simultaneity is hard in code. Here, actions are sequential per player.
		// TODO: Implement player choice for selecting which cards to discard/sacrifice.
		// The current implementation uses a deterministic approach (e.g., removing the last item added to the zone).
		// TODO: Process choices in initiative order if >2 players. For 2 players, current player then opponent is fine.

		console.log('[GSM] Beginning Clean-up phase.');
		// For simplicity in a 2-player game context, iterating through players directly is okay.
		// For >2 players, an explicit initiative order would be needed for choices.
		for (const player of this.state.players.values()) {
			const hero = player.zones.heroZone.getAll()[0] as IGameObject | undefined;
			const reserveLimit = hero?.baseCharacteristics.reserveLimit ?? 2;
			const landmarkLimit = hero?.baseCharacteristics.landmarkLimit ?? 2;

			// Clean-up Reserve
			const reserveZone = player.zones.reserveZone;
			while (reserveZone.getCount() > reserveLimit) {
				// TODO: Add player choice. For now, discard the last card.
				const cardToDiscard = reserveZone.getAll().pop() as IGameObject;
				if (cardToDiscard) {
					console.log(
						`[GSM] ${player.id} is over reserve limit, discarding ${cardToDiscard.name}.`
					);
					this.moveEntity(
						cardToDiscard.objectId,
						reserveZone,
						player.zones.discardPileZone,
						player.id
					);
				}
			}

			// Clean-up Landmarks (Sacrifice)
			const landmarkZone = player.zones.landmarkZone;
			while (landmarkZone.getCount() > landmarkLimit) {
				// TODO: Add player choice. For now, sacrifice the last card.
				const cardToSacrifice = landmarkZone.getAll().pop() as IGameObject;
				if (cardToSacrifice) {
					console.log(
						`[GSM] ${player.id} is over landmark limit, sacrificing ${cardToSacrifice.name}.`
					);
					this.moveEntity(
						cardToSacrifice.objectId,
						landmarkZone,
						player.zones.discardPileZone,
						player.id
					);
				}
			}
		}
	}

	/**
	 * Calculates the terrain statistics for an expedition
	 * Rule 4.2.4, 7.1.2
	 */
	public calculateExpeditionStats(
		playerId: string,
		_expeditionType: 'hero' | 'companion'
	): ITerrainStats {
		const player = this.getPlayer(playerId);
		if (!player) return { forest: 0, mountain: 0, water: 0 };

		const expeditionZone = player.zones.expeditionZone;
		const stats: ITerrainStats = { forest: 0, mountain: 0, water: 0 };

		for (const entity of expeditionZone.getAll()) {
			if (isGameObject(entity) && entity.type === CardType.Character) {
				// Skip if Character has Asleep status during Progress (Rule 2.4.3)
				if (entity.statuses.has(StatusType.Asleep)) continue;

				// Get base statistics
				const entityStats = entity.currentCharacteristics.statistics;
				if (entityStats) {
					stats.forest += entityStats.forest || 0;
					stats.mountain += entityStats.mountain || 0;
					stats.water += entityStats.water || 0;
				}

				// Add boost counters (Rule 2.5.1.b)
				const boostCount = entity.counters.get(CounterType.Boost) || 0;
				stats.forest += boostCount;
				stats.mountain += boostCount;
				stats.water += boostCount;
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

			if (!player.heroExpedition.canMove || !player.companionExpedition.canMove) {
				console.log(`[GSM] Player ${player.id} expeditions cannot move due to Defender.`);
				continue;
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
						// Target region for hero is adventureRegions[currentHeroPos]
						// because position is 0-indexed and represents number of regions already traversed.
						// So if pos = 0, next region is index 0. If pos = 1, next region is index 1.
						const targetHeroRegion = adventureRegions[currentHeroPos];
						// Safely access terrains, defaulting to empty array if not present
						const heroRegionTerrains = targetHeroRegion?.terrains || [];

						if (this.expeditionShouldMove(heroStats, oppHeroStats, heroRegionTerrains)) {
							player.heroExpedition.position++;
							player.heroExpedition.hasMoved = true;
							console.log(
								`[GSM] Player ${player.id} hero expedition moved to position ${player.heroExpedition.position} (into region ${targetHeroRegion?.id || 'unknown'})`
							);
						}
					}
				}

				// Companion expedition
				if (player.companionExpedition.canMove) {
					const currentCompanionPos = player.companionExpedition.position;
					if (currentCompanionPos < totalRegions) {
						// Target region for companion is adventureRegions[totalRegions - 1 - currentCompanionPos]
						// E.g. totalRegions = 5. pos = 0 -> target index 4. pos = 1 -> target index 3.
						const targetCompanionRegionIndex = totalRegions - 1 - currentCompanionPos;
						const targetCompanionRegion = adventureRegions[targetCompanionRegionIndex];
						// Safely access terrains, defaulting to empty array if not present
						const companionRegionTerrains = targetCompanionRegion?.terrains || [];

						if (this.expeditionShouldMove(companionStats, oppCompanionStats, companionRegionTerrains)) {
							player.companionExpedition.position++;
							player.companionExpedition.hasMoved = true;
							console.log(
								`[GSM] Player ${player.id} companion expedition moved to position ${player.companionExpedition.position} (into region ${targetCompanionRegion?.id || 'unknown'})`
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
	): boolean {
		const terrainsToCompare: (keyof ITerrainStats)[] = ['forest', 'mountain', 'water'];

		for (const terrain of terrainsToCompare) {
			if (regionTerrains.includes(terrain)) {
				const myStatValue = Math.max(0, myStats[terrain] || 0);
				const opponentStatValue = Math.max(0, opponentStats[terrain] || 0);

				if (myStatValue > 0 && myStatValue > opponentStatValue) {
					return true; // Found a terrain where my expedition has greater positive total
				}
			}
		}
		return false; // No such terrain found
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
}
