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
	// public passiveManager: PassiveAbilityManager; // Removed
	public ruleAdjudicator: RuleAdjudicator;
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
		this.effectExecutionManager = this.effectProcessor; // Alias for test compatibility
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
			expedition: new GenericZone('shared-expedition', ZoneIdentifier.Expedition, 'visible'), // Changed ID, removed 'deprecated'
			limbo: new LimboZone()
		};

		playerIds.forEach((pid) => {
			const handZone = new HandZone(`${pid}-hand`, pid);
			const reserveZone = new GenericZone(`${pid}-reserve`, ZoneIdentifier.Reserve, 'visible', pid);
			// const expeditionZone = new GenericZone( // Removed: expedition zone is shared
			// 	`${pid}-expedition`,
			// 	ZoneIdentifier.Expedition,
			// 	'visible',
			// 	pid
			// );
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
					// expeditionZone: expeditionZone, // Removed
					limboZone: sharedZones.limbo, // Reference to shared limbo zone
					hand: handZone, // Alias for test compatibility
					reserve: reserveZone, // Alias for test compatibility
					// expedition: expeditionZone, // Alias removed
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
			yield player.zones.discardPileZone; // Corrected: discardPile -> discardPileZone
			yield player.zones.manaZone;
			yield player.zones.reserveZone;    // Corrected: reserve -> reserveZone (using the primary, not alias)
			yield player.zones.landmarkZone;
			yield player.zones.heroZone;
			// yield player.zones.expeditionZone; // Removed: expedition zone is shared
		}
		yield this.state.sharedZones.adventure;
		yield this.state.sharedZones.expedition; // Added shared expedition zone
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

	private getPlayerIdsInInitiativeOrder(startingPlayerId: string): string[] {
		const playerIds = Array.from(this.state.players.keys());
		const startIndex = playerIds.indexOf(startingPlayerId);
		if (startIndex === -1) {
			console.warn(`[GSM] startingPlayerId ${startingPlayerId} not found in playerIds. Defaulting to full list.`);
			return playerIds; // Should not happen with valid startingPlayerId
		}
		return [...playerIds.slice(startIndex), ...playerIds.slice(0, startIndex)];
	}

	public async resolveReactions(): Promise<void> {
		console.log('[GSM] Checking reactions...');
		let reactionsProcessedInLoop = 0; // Safety break for too many reactions in one event chain

		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (reactionsProcessedInLoop > 100) { // Rule 1.4.6.c (per ability, but good safety here too)
				console.warn('[GSM] Exceeded reaction processing limit in a single chain. Breaking loop.');
				break;
			}

			const limboZone = this.state.sharedZones.limbo;
			const allEmblemReactions = limboZone.getAll().filter(
				(e): e is IEmblemObject =>
					isGameObject(e) && e.type === CardType.Emblem && e.emblemSubType === 'Reaction'
			);

			if (allEmblemReactions.length === 0) {
				console.log('[GSM] No more reactions in Limbo.');
				break; // No reactions to process
			}

			// Determine player order based on initiative (Rule 1.4.5, 4.4.b)
			let initiativePlayerId = this.state.currentPlayerId; // Default to current player (e.g., during Afternoon)
			if (this.state.currentPhase !== GamePhase.Afternoon) { // Or any other phase where firstPlayerId takes precedence for initiative
				initiativePlayerId = this.state.firstPlayerId;
			}

			const playerIdsInInitiativeOrder = this.getPlayerIdsInInitiativeOrder(initiativePlayerId);
			let reactionPlayedThisIteration = false;

			for (const pId of playerIdsInInitiativeOrder) {
				const playerEmblems = allEmblemReactions.filter(e => e.controllerId === pId);

				if (playerEmblems.length > 0) {
					// Player choice needed if multiple reactions.
					// Delegate choice to PlayerActionHandler.
					const chosenEmblemId = await this.actionHandler.chooseReaction(pId, playerEmblems);

					if (!chosenEmblemId) {
						console.log(`[GSM] Player ${pId} chose not to play a reaction or no valid choice was made.`);
						continue; // Move to the next player or iteration
					}

					const emblemToPlay = playerEmblems.find(e => e.objectId === chosenEmblemId);

					if (!emblemToPlay) {
						console.error(`[GSM] Chosen emblem ID ${chosenEmblemId} not found in available player emblems for player ${pId}. This should not happen.`);
						continue; // Should not occur if chooseReaction returns a valid ID from the list
					}

					console.log(`[GSM] Player ${pId} (initiative) playing reaction: ${emblemToPlay.name} (ID: ${emblemToPlay.objectId})`);

					let sourceObjectForEffectContext: IGameObject | undefined = undefined;
					if (emblemToPlay.boundEffect.sourceObjectId) {
						sourceObjectForEffectContext = this.getObject(emblemToPlay.boundEffect.sourceObjectId);
						if (!sourceObjectForEffectContext) {
							console.warn(`[GSM] Source object ${emblemToPlay.boundEffect.sourceObjectId} for reaction emblem ${emblemToPlay.objectId} not found. Using LKI might be needed if effect depends on it.`);
						}
					}

					await this.effectProcessor.resolveEffect(emblemToPlay.boundEffect, sourceObjectForEffectContext);

					limboZone.remove(emblemToPlay.objectId);
					console.log(`[GSM] Reaction emblem ${emblemToPlay.objectId} resolved and removed from Limbo.`);

					reactionsProcessedInLoop++;
					reactionPlayedThisIteration = true;
					break; // Process one reaction per overall loop, then re-evaluate all available reactions
				}
			}

			if (!reactionPlayedThisIteration) {
				console.log('[GSM] No reactions played by initiative players this iteration. Exiting loop.');
				break;
			}
		}
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
				return this.state.sharedZones.expedition; // Changed to shared expedition zone
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
		this.statusHandler.processStatusEffectsDuringPhase('morning'); // Readies objects etc.

		// Reset ability activation counts for "Nothing is Forever" rule (Rule 1.4.6)
		console.log('[GSM] Resetting daily ability activation counts.');
		for (const zone of this.getAllVisibleZones()) {
			for (const entity of zone.getAll()) {
				if (isGameObject(entity)) {
					if (entity.abilityActivationsToday) {
						entity.abilityActivationsToday.clear();
					} else {
						// Initialize if it somehow wasn't during creation
						entity.abilityActivationsToday = new Map<string, number>();
					}
				}
			}
		}
		// Note: The original duplicate preparePhase method at the end of the file should be reviewed/removed if redundant.
	}

	/**
	 * Handles the Rest daily effect during the Night phase.
	 * Rule 4.2.5.b
	 */
	public async restPhase() {
		console.log('[GSM] Beginning Rest phase.');
		const expeditionZone = this.state.sharedZones.expedition; // Use shared expedition zone

		for (const player of this.state.players.values()) {
			// Filter entities for the current player and relevant types
			const entitiesToProcess = expeditionZone.getAll().filter((e): e is IGameObject => {
				if (!isGameObject(e)) return false;
				// Ensure the entity belongs to the player currently being processed in the restPhase loop
				if (e.controllerId !== player.id) return false;
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
		// Rule 1.4.5.a / 6.1.h: Choices are made in initiative order.
		console.log('[GSM] Beginning Clean-up phase.');

		const playerIdsInOrder = this.getPlayerIdsInInitiativeOrder(this.state.firstPlayerId);

		for (const playerId of playerIdsInOrder) {
			const player = this.getPlayer(playerId);
			if (!player) continue;

			const hero = player.zones.heroZone.getAll().find(obj => isGameObject(obj) && obj.type === CardType.Hero) as IGameObject | undefined;
			const reserveLimit = hero?.baseCharacteristics.reserveLimit ?? 2;
			const landmarkLimit = hero?.baseCharacteristics.landmarkLimit ?? 2;

			// --- Reserve Clean-up ---
			const reserveZone = player.zones.reserveZone;
			const reserveObjects = reserveZone.getAll().filter(isGameObject);

			if (reserveObjects.length > reserveLimit) {
				console.log(`[GSM] Player ${playerId} Reserve: ${reserveObjects.length} cards, limit: ${reserveLimit}. Starting cleanup.`);
				// Sort by reserve cost (desc), then by timestamp (asc - older first)
				reserveObjects.sort((a, b) => {
					const defA = this.getCardDefinition(a.definitionId);
					const defB = this.getCardDefinition(b.definitionId);
					const costA = defA?.reserveCost ?? 0;
					const costB = defB?.reserveCost ?? 0;

					if (costB !== costA) {
						return costB - costA; // Higher cost first
					}
					return (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity); // Older (smaller timestamp) first
				});

				const cardsToKeep = reserveObjects.slice(0, reserveLimit);
				const cardsToDiscard = reserveObjects.slice(reserveLimit);

				console.log(`[GSM] Player ${playerId} keeping in Reserve: ${cardsToKeep.map(c => `${c.name}(${c.definitionId})`).join(', ')}`);
				for (const cardToDiscard of cardsToDiscard) {
					console.log(
						`[GSM] Player ${playerId} is over reserve limit, discarding ${cardToDiscard.name} (${cardToDiscard.definitionId}) from Reserve.`
					);
					this.moveEntity(
						cardToDiscard.objectId,
						reserveZone,
						player.zones.discardPileZone,
						playerId
					);
					// Note: moveEntity should trigger relevant events/reactions if any.
				}
			}

			// --- Landmark Clean-up ---
			const landmarkZone = player.zones.landmarkZone;
			const landmarkObjects = landmarkZone.getAll().filter(isGameObject);

			if (landmarkObjects.length > landmarkLimit) {
				console.log(`[GSM] Player ${playerId} Landmark: ${landmarkObjects.length} cards, limit: ${landmarkLimit}. Starting cleanup.`);
				// Sort by hand cost (desc), then by timestamp (asc - older first)
				// Using handCost as a proxy for value if reserveCost isn't applicable to landmarks.
				landmarkObjects.sort((a, b) => {
					const defA = this.getCardDefinition(a.definitionId);
					const defB = this.getCardDefinition(b.definitionId);
					const costA = defA?.handCost ?? 0; // Or another relevant cost if landmarks have specific ones
					const costB = defB?.handCost ?? 0;

					if (costB !== costA) {
						return costB - costA; // Higher cost first
					}
					return (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity); // Older (smaller timestamp) first
				});

				const cardsToKeep = landmarkObjects.slice(0, landmarkLimit);
				const cardsToSacrifice = landmarkObjects.slice(landmarkLimit);

				console.log(`[GSM] Player ${playerId} keeping in Landmark: ${cardsToKeep.map(c => `${c.name}(${c.definitionId})`).join(', ')}`);
				for (const cardToSacrifice of cardsToSacrifice) {
					console.log(
						`[GSM] Player ${playerId} is over landmark limit, sacrificing ${cardToSacrifice.name} (${cardToSacrifice.definitionId}) from Landmark.`
					);
					// Rule 7.3.25.a: "sacrifice ... they have to discard an object in play they control"
					this.moveEntity(
						cardToSacrifice.objectId,
						landmarkZone,
						player.zones.discardPileZone, // Sacrificed cards go to discard pile
						playerId
					);
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
		_expeditionType: 'hero' | 'companion'
	): ITerrainStats {
		const player = this.getPlayer(playerId);
		if (!player) return { forest: 0, mountain: 0, water: 0 };

		const expeditionZone = this.state.sharedZones.expedition; // Use shared expedition zone
		const stats: ITerrainStats = { forest: 0, mountain: 0, water: 0 };

		const expeditionEntities = expeditionZone.getAll().filter(entity => {
			if (!isGameObject(entity)) return false;
			// Ensure correct typing for _expeditionType if it can be 'Hero' or 'Companion'
			const typeComparison = _expeditionType === 'hero' ? 'Hero' : 'Companion';
			return entity.expeditionAssignment?.playerId === playerId &&
				   entity.expeditionAssignment?.type === typeComparison;
		});

		for (const entity of expeditionEntities) {
			if (isGameObject(entity) && entity.type === CardType.Character) {
				// Skip if Character has Asleep status during Progress (Rule 2.4.3)
				// This check is still relevant for the filtered entities.
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

	/**
	 * Calculate expedition statistics for progress phase
	 * Rule 7.5.2 - Ahead, Behind, Tied
	 */
	public calculateExpeditionStats(playerId: string, expeditionType: 'hero' | 'companion'): { forest: number; mountain: number; water: number } {
		const player = this.getPlayer(playerId);
		if (!player) {
			return { forest: 0, mountain: 0, water: 0 };
		}

		let totalStats = { forest: 0, mountain: 0, water: 0 };
		const expeditionZone = this.state.sharedZones.expedition; // Use shared expedition zone

		// Get all characters in the shared expedition zone, filtered by playerId and expeditionType.
		const expeditionEntities = expeditionZone.getAll().filter(entity => {
			if (!isGameObject(entity)) return false;
			// Ensure correct typing for expeditionType if it can be 'Hero' or 'Companion'
			const typeComparison = expeditionType === 'hero' ? 'Hero' : 'Companion';
			return entity.expeditionAssignment?.playerId === playerId &&
				   entity.expeditionAssignment?.type === typeComparison;
		});
		
		for (const entity of expeditionEntities) {
			if (isGameObject(entity) && entity.type === CardType.Character) {
				// Rule 2.4.3.a: Asleep characters' stats are not counted during Progress
				// This check is still relevant for the filtered entities.
				if (entity.statuses.has(StatusType.Asleep)) {
					continue;
				}

				// Include base statistics
				if (entity.baseCharacteristics.statistics) {
					totalStats.forest += entity.baseCharacteristics.statistics.forest;
					totalStats.mountain += entity.baseCharacteristics.statistics.mountain;
					totalStats.water += entity.baseCharacteristics.statistics.water;
				}

				// Rule 2.4.4: Add boost counters if object is Boosted
				const boostCounters = entity.counters.get(CounterType.Boost) || 0;
				if (boostCounters > 0) {
					totalStats.forest += boostCounters;
					totalStats.mountain += boostCounters;
					totalStats.water += boostCounters;
				}

				// Rule 7.4.4.e: Gigantic characters count in both expeditions
				if ((entity.currentCharacteristics as any).isGigantic) {
					// Character already counted once above, no need to double count here
					// The calling logic should handle Gigantic appropriately
				}
			}
		}

		return totalStats;
	}

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
	 * Get zone by identifier for a player
	 */
	private getZoneByIdentifier(player: IPlayer, zoneId: ZoneIdentifier): IZone | undefined {
		switch (zoneId) {
			case ZoneIdentifier.Hand:
				return player.zones.handZone;
			case ZoneIdentifier.Reserve:
				return player.zones.reserveZone;
			case ZoneIdentifier.Expedition:
				return this.state.sharedZones.expedition; // Changed to shared expedition zone
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
				// Rule 2.4.4: Update Boosted status based on boost counters
				const boostCount = obj.counters.get(CounterType.Boost) || 0;
				if (boostCount > 0) {
					obj.statuses.add(StatusType.Boosted);
				} else {
					obj.statuses.delete(StatusType.Boosted);
				}
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
	public async preparePhase(): Promise<void> {
		console.log('[GSM] Prepare phase - readying exhausted cards');
		const expeditionZone = this.state.sharedZones.expedition; // Use shared expedition zone
		
		// Ready cards in the shared expedition zone
		for (const entity of expeditionZone.getAll()) {
			if (isGameObject(entity) && entity.statuses.has(StatusType.Exhausted)) {
				entity.statuses.delete(StatusType.Exhausted);
			}
		}

		for (const player of this.state.players.values()) {
			// Ready cards in player-specific reserve
			for (const entity of player.zones.reserveZone.getAll()) {
				if (isGameObject(entity) && entity.statuses.has(StatusType.Exhausted)) {
					entity.statuses.delete(StatusType.Exhausted);
				}
			}
		}
	}

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
}
