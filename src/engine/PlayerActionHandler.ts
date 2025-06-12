import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance, IEmblemObject } from './types/objects';
import { GamePhase, CardType, StatusType, ZoneIdentifier, AbilityType } from './types/enums';
import { isGameObject } from './types/objects';
import type { TargetInfo } from './CardPlaySystem'; // Assuming TargetInfo is in CardPlaySystem
// import type { TargetRequirement } from './CardPlaySystem'; // If defined there

/**
 * Handles player actions.
 */
export class PlayerActionHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Gets available actions for a player.
	 * Rule 4.2.3.d (Afternoon), Rule 4.2.1.e (Morning Expand)
	 */
	public async getAvailableActions(playerId: string): Promise<PlayerAction[]> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const actions: PlayerAction[] = [];
		const currentPhase = this.gsm.state.currentPhase;
		const isCurrentPlayer = this.gsm.state.currentPlayerId === playerId;

		// Play Card Actions (Hand & Reserve) - Typically Afternoon
		if (isCurrentPlayer && currentPhase === GamePhase.Afternoon) {
			// From Hand
			for (const cardInHand of player.zones.handZone.getAll()) {
				// Ensure cardInHand is ICardInstance for type safety with cardId potentially being instanceId
				const currentCardId = cardInHand.instanceId; // Assuming ICardInstance has instanceId
				const canPlayCheck = await this.gsm.cardPlaySystem.canPlayCard(playerId, currentCardId, ZoneIdentifier.Hand);
				if (canPlayCheck.isPlayable) {
					actions.push({
						type: 'playCard',
						cardId: currentCardId,
						cardDefinitionId: canPlayCheck.definitionId,
						zone: ZoneIdentifier.Hand,
						cost: canPlayCheck.cost,
						description: `Play ${this.gsm.getCardDefinition(cardInHand.definitionId)?.name || 'Card'} from hand (Cost: ${canPlayCheck.cost})`
						// TODO: Add targeting requirements if card needs targets
					});
				}
			}
			// From Reserve
			for (const cardInReserve of player.zones.reserveZone.getAll()) {
				if (isGameObject(cardInReserve)) { // Cards in reserve are IGameObjects
					const canPlayCheck = await this.gsm.cardPlaySystem.canPlayCard(playerId, cardInReserve.objectId, ZoneIdentifier.Reserve);
					if (canPlayCheck.isPlayable) {
						actions.push({
							type: 'playCard',
							cardId: cardInReserve.objectId,
							cardDefinitionId: canPlayCheck.definitionId,
							zone: ZoneIdentifier.Reserve,
							cost: canPlayCheck.cost,
							description: `Play ${cardInReserve.name} from reserve (Cost: ${canPlayCheck.cost})`
							// TODO: Add targeting requirements
						});
					}
				}
			}
		}

		// Activate Ability Actions (Quick Actions)
		if (isCurrentPlayer) { // Simplified: only current player can activate abilities for now
			const activatableAbilities = await this.getActivatableQuickActions(playerId);
			actions.push(...activatableAbilities);
		}

		// Pass Turn Action (Afternoon only)
		if (isCurrentPlayer && currentPhase === GamePhase.Afternoon) {
			actions.push({ type: 'pass', description: 'Pass turn' });
		}

		// Expand Action (Morning only)
		if (currentPhase === GamePhase.Morning && isCurrentPlayer && !player.hasExpandedThisTurn && player.zones.handZone.getCount() > 0) {
			actions.push({
				type: 'expandMana',
				description: 'Expand a card from your hand to your Mana zone.'
				// cardToExpandId would be chosen by player before execution
			});
		}

		// Mana Conversion
		if (isCurrentPlayer) { // Typically on player's turn
			const manaZone = player.zones.manaZone;
			const allManaOrbs = manaZone.getAll().filter(isGameObject);
			const readyOrbs = allManaOrbs.filter(orb => !orb.statuses.has(StatusType.Exhausted));
			const exhaustedOrbs = allManaOrbs.filter(orb => orb.statuses.has(StatusType.Exhausted));

			for (const readyOrb of readyOrbs) {
				for (const exhaustedOrb of exhaustedOrbs) {
					if (readyOrb.objectId !== exhaustedOrb.objectId) {
						actions.push({
							type: 'convertManaOrb',
							sourceOrbId: readyOrb.objectId,
							targetOrbId: exhaustedOrb.objectId,
							description: `Exhaust ${readyOrb.name || 'Orb'} to ready ${exhaustedOrb.name || 'Orb'}`
						});
					}
				}
			}
		}
		return actions;
	}

	private async getActivatableQuickActions(playerId: string): Promise<PlayerAction[]> {
		const availableQuickActions: PlayerAction[] = [];
		// Use a default if gsm.config or nothingIsForeverLimit is not set
		const activationLimit = (this.gsm.config as any)?.nothingIsForeverLimit ?? 100; // Rule 1.4.6.b

		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const zonesToScan = [
			player.zones.heroZone,
			this.gsm.state.sharedZones.expedition,
			player.zones.landmarkZone,
			player.zones.reserveZone,
		];

		for (const zone of zonesToScan) {
			const playerObjects = zone.getAll().filter(
				(e): e is IGameObject => isGameObject(e) && e.controllerId === playerId
			);

			for (const sourceObject of playerObjects) {
				const allAbilities = [
					...sourceObject.abilities,
					...(sourceObject.currentCharacteristics.grantedAbilities || [])
				];

				for (const ability of allAbilities) {
					if (ability.abilityType !== AbilityType.QuickAction) continue;

					// Support Quick Actions (Rule 2.2.11.e)
					if (zone.zoneType === ZoneIdentifier.Reserve && !ability.isSupportAbility) continue;
					if (zone.zoneType !== ZoneIdentifier.Reserve && ability.isSupportAbility) continue;

					const currentActivations = sourceObject.abilityActivationsToday?.get(ability.abilityId) || 0;
					if (currentActivations >= activationLimit) continue;

					let canPayAllCosts = true;
					if (ability.cost) {
						if (ability.cost.mana && ability.cost.mana > 0) {
							if (!this.gsm.manaSystem.canPayMana(playerId, ability.cost.mana)) {
								canPayAllCosts = false;
							}
						}
						if (ability.cost.exhaustSelf) {
							if (sourceObject.statuses.has(StatusType.Exhausted)) canPayAllCosts = false;
						}
						if (ability.cost.discardSelfFromReserve) {
							if (zone.zoneType !== ZoneIdentifier.Reserve || sourceObject.statuses.has(StatusType.Exhausted)) {
								canPayAllCosts = false;
							}
						}
						// TODO: Add other cost checks (sacrifice, spendCounters)
					}

					if (canPayAllCosts) {
						availableQuickActions.push({
							type: 'quickAction',
							abilityId: ability.abilityId,
							sourceObjectId: sourceObject.objectId,
							description: `Use QA: ${ability.text || ability.abilityId} from ${sourceObject.name}`
							// TODO: Add targeting requirements
						});
					}
				}
			}
		}
		return availableQuickActions;
	}

	/**
	 * Executes a player action.
	 */
	public async executeAction(playerId: string, action: PlayerAction): Promise<boolean> {
		// Basic check, more nuanced checks per action type might be needed
		if (this.gsm.state.currentPlayerId !== playerId &&
			action.type !== 'convertManaOrb' && // Allow mana conversion if applicable out of turn
			action.type !== 'expandMana' // Expand mana is phase-specific, not turn-specific necessarily
		) {
			// Most actions require it to be the player's turn.
			// throw new Error(`Not ${playerId}'s turn to perform action ${action.type}`);
		}

		let turnEnds = false;

		switch (action.type) {
			case 'pass':
				if (this.gsm.state.currentPhase !== GamePhase.Afternoon || this.gsm.state.currentPlayerId !== playerId) {
					throw new Error('Cannot pass turn outside of Afternoon phase or if not current player.');
				}
				if(this.gsm.turnManager) this.gsm.turnManager.playerPasses(playerId); // Check if turnManager is set
				else console.warn("[PlayerActionHandler] TurnManager not available on GSM for pass action.");
				console.log(`[PlayerActionHandler] ${playerId} passed their turn`);
				turnEnds = true;
				break;

			case 'playCard':
				if (!action.cardId || action.zone === undefined) {
					throw new Error('Action playCard missing cardId or zone.');
				}
				await this.executePlayCardAction(playerId, action.cardId, action.zone as ZoneIdentifier, action.selectedExpeditionType, action.targets);
				console.log(`[PlayerActionHandler] ${playerId} played card: ${action.cardDefinitionId || action.cardId}`);
				turnEnds = true;
				break;

			case 'quickAction':
				if (!action.abilityId || !action.sourceObjectId) {
					throw new Error('Action quickAction missing abilityId or sourceObjectId.');
				}
				await this.executeActivateAbilityAction(playerId, action.sourceObjectId, action.abilityId, action.targets);
				console.log(`[PlayerActionHandler] ${playerId} used quick action: ${action.abilityId} on ${action.sourceObjectId}`);
				turnEnds = false;
				break;

			case 'expandMana':
				// cardToExpandId should be part of the action if a specific card is chosen prior to execution
				if (!action.cardToExpandId && !action.cardId) throw new Error('No card specified for expandMana action.');
				const cardToExpand = action.cardToExpandId || action.cardId; // Use cardId if cardToExpandId isn't filled
				if(!cardToExpand) throw new Error('No card ID found for expandMana action.');
				await this.executeExpandAction(playerId, cardToExpand);
				console.log(`[PlayerActionHandler] Player ${playerId} expanded a card to mana.`);
				turnEnds = false;
				break;

			case 'convertManaOrb':
				if (!action.sourceOrbId || !action.targetOrbId) {
					throw new Error('Action convertManaOrb missing sourceOrbId or targetOrbId.');
				}
				const converted = this.gsm.manaSystem.convertMana(playerId, action.sourceOrbId, action.targetOrbId);
				if (!converted) {
					console.warn(`[PlayerActionHandler] Mana conversion failed for player ${playerId}.`);
				} else {
					console.log(`[PlayerActionHandler] ${playerId} converted mana.`);
				}
				turnEnds = false;
				break;

			default:
				throw new Error(`Unknown action type: ${(action as any).type}`);
		}

		if (action.type !== 'pass' && action.type !== 'convertManaOrb') {
			await this.gsm.resolveReactions();
		}

		return turnEnds;
	}

	public async executePlayCardAction(
		playerId: string,
		cardId: string,
		fromZone: ZoneIdentifier,
		selectedExpeditionType?: 'hero' | 'companion',
		targets?: TargetInfo[]
	): Promise<void> {
		await this.gsm.cardPlaySystem.playCard(playerId, cardId, fromZone, selectedExpeditionType, targets);
	}

	public async executeActivateAbilityAction(
		playerId: string,
		sourceObjectId: string,
		abilityId: string,
		targets?: TargetInfo[]
	): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		const sourceObject = this.gsm.getObject(sourceObjectId);

		if (!player) throw new Error(`Player ${playerId} not found.`);
		if (!sourceObject) throw new Error(`Source object ${sourceObjectId} not found.`);
		if (sourceObject.controllerId !== playerId) {
			throw new Error(`Player ${playerId} does not control source object ${sourceObjectId}.`);
		}

		const allAbilities = [
			...(sourceObject.currentCharacteristics.abilities || []),
			...(sourceObject.currentCharacteristics.grantedAbilities || [])
		];
		const ability = allAbilities.find(a => a.abilityId === abilityId);

		if (!ability) throw new Error(`Ability ${abilityId} not found on source object ${sourceObjectId}.`);
		if (ability.abilityType !== AbilityType.QuickAction) {
			throw new Error(`Ability ${abilityId} on ${sourceObjectId} is not a QuickAction.`);
		}

		const activationLimit = (this.gsm.config as any)?.nothingIsForeverLimit ?? 100;
		const currentActivations = sourceObject.abilityActivationsToday?.get(abilityId) || 0;
		if (currentActivations >= activationLimit) {
			throw new Error(`Quick action ${abilityId} on ${sourceObjectId} has reached its daily activation limit.`);
		}

		if (ability.cost) {
			if (ability.cost.mana && ability.cost.mana > 0) { // Check for positive cost
				await this.gsm.manaSystem.spendMana(playerId, ability.cost.mana);
				console.log(`[PlayerActionHandler] Paid ${ability.cost.mana} mana for QA ${abilityId} from ${sourceObject.name}.`);
			}
			if (ability.cost.exhaustSelf) {
				if (sourceObject.statuses.has(StatusType.Exhausted)) {
					throw new Error(`Cannot pay exhaustSelf cost: ${sourceObject.name} is already exhausted.`);
				}
				sourceObject.statuses.add(StatusType.Exhausted);
				this.gsm.eventBus.publish('objectStatusChanged', { object: sourceObject, status: StatusType.Exhausted, added: true });
				console.log(`[PlayerActionHandler] Exhausted ${sourceObject.name} for QA ${abilityId}.`);
			}
			if (ability.cost.discardSelfFromReserve) {
				const objectZone = this.gsm.findZoneOfObject(sourceObject.objectId);
				if (!objectZone || objectZone.zoneType !== ZoneIdentifier.Reserve) {
					throw new Error(`${sourceObject.name} is not in Reserve to pay discardSelfFromReserve cost.`);
				}
				if (sourceObject.statuses.has(StatusType.Exhausted)){
					throw new Error(`Cannot discard exhausted ${sourceObject.name} from reserve to pay cost.`);
				}
				this.gsm.moveEntity(sourceObjectId, player.zones.reserveZone, player.zones.discardPileZone, playerId);
				console.log(`[PlayerActionHandler] Discarded ${sourceObject.name} from Reserve for QA ${abilityId}.`);
			}
			// TODO: Implement other cost types (sacrifice, spendCounters)
		}

		await this.gsm.effectProcessor.resolveEffect(ability.effect, sourceObject, targets, (ability as any)._triggerPayload );
		console.log(`[PlayerActionHandler] Resolved effect for QA ${abilityId} from ${sourceObject.name}.`);

		if (!sourceObject.abilityActivationsToday) {
			sourceObject.abilityActivationsToday = new Map<string, number>();
		}
		sourceObject.abilityActivationsToday.set(abilityId, currentActivations + 1);
		console.log(`[PlayerActionHandler] Incremented QA count for ${abilityId} on ${sourceObject.name} to ${currentActivations + 1}.`);

		await this.gsm.resolveReactions();
	}

	// Remove old synchronous helper methods as their logic is now part of the new async flow or CardPlaySystem
	// private getPlayableCardsFromHand(playerId: string): ICardInstance[] { ... }
	// private getPlayableCardsFromReserve(playerId: string): IGameObject[] { ... }
	// private canPlayCardFromHand(playerId: string, card: ICardInstance): boolean { ... }
	// private canPlayCardFromReserve(playerId: string, object: IGameObject): boolean { ... }
	// private canPayManaCost(playerId: string, cost: number): boolean { ... }
	// private async playCard(playerId: string, cardId: string, fromZone: string): Promise<void> { ... } // Old name for execution
	// private async payManaCost(playerId: string, cost: number): Promise<void> { ... }
	// private getAvailableQuickActions(playerId: string): PlayerAction[] { ... } // Old synchronous version
	// private async executeQuickAction(playerId: string, abilityId: string, sourceObjectId: string): Promise<void> { ... } // Old version


	/**
	 * Gets available expand action for a player.
	 * Rule 4.2.1.e - Expand: Player may move one card from hand to Mana zone.
	 */
	public getAvailableExpandAction(playerId: string): PlayerAction | null {
		const player = this.gsm.getPlayer(playerId);
		if (!player || player.hasExpandedThisTurn) {
			return null;
		}

		// This action is only available during the Morning phase's Expand step.
		// PhaseManager will be responsible for calling this at the right time.
		// For now, we just check if the player has cards in hand.
		if (player.zones.hand.isEmpty()) {
			return null;
		}

		// For simplicity, we assume any card can be chosen.
		// A more advanced version would list choices or filter by expandable cards.
		// We'll return a generic action here, the specific card will be chosen by the player.
		// The PhaseManager will simulate this choice for now.
		return {
			type: 'expandMana',
			description: 'Expand a card from your hand to your Mana zone.',
		};
	}

	/**
	 * Executes the expand action.
	 * Moves a card from hand to Mana zone, face down, as a Mana Orb.
	 */
	public async executeExpandAction(playerId: string, cardIdToExpand: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			throw new Error(`Player ${playerId} not found.`);
		}
		if (player.hasExpandedThisTurn) {
			throw new Error(`Player ${playerId} has already expanded this turn.`);
		}

		const cardToMove = player.zones.hand.findById(cardIdToExpand) as ICardInstance | undefined;
		if (!cardToMove) {
			throw new Error(`Card ${cardIdToExpand} not found in player ${playerId}'s hand.`);
		}

		// Move the card to the player's Mana zone.
		// It becomes a new IGameObject in the Mana zone.
		const newManaOrb = this.gsm.moveEntity(
			cardIdToExpand,
			player.zones.hand,
			player.zones.manaZone,
			playerId,
			{
				definitionId: cardToMove.definitionId,
				name: 'Mana Orb',
				type: CardType.ManaOrb,
				faceDown: true,
				controllerId: playerId,
				ownerId: playerId,
				statuses: new Set(),
				abilities: [],
				effects: [],
				zoneId: player.zones.manaZone.id,
			}
		);

		if (!newManaOrb || !isGameObject(newManaOrb)) {
			throw new Error(`Failed to create new Mana Orb from card ${cardIdToExpand}`);
		}

		newManaOrb.statuses.delete(StatusType.Exhausted);

		player.hasExpandedThisTurn = true;
		this.gsm.recordExpansion(playerId);

		console.log(`[PlayerActionHandler] Player ${playerId} expanded card ${cardIdToExpand} into a Mana Orb ${newManaOrb.objectId}.`);
	}

	public async chooseReaction(playerId: string, availableReactions: IEmblemObject[]): Promise<string | null> {
		if (availableReactions.length === 0) {
			return null;
		}
		// TODO: Implement actual player choice mechanism here.
		// For now, mimics the old behavior: sorts by timestamp and picks the oldest.
		console.log(`[PlayerActionHandler] Player ${playerId} needs to choose a reaction from ${availableReactions.length} available.`);

		availableReactions.sort((a, b) => a.timestamp - b.timestamp);
		const chosenReaction = availableReactions[0];

		console.log(`[PlayerActionHandler] Auto-choosing oldest reaction: ${chosenReaction.name} (ID: ${chosenReaction.objectId}) for player ${playerId}.`);
		return chosenReaction.objectId;
	}

	/**
	 * Allows a player to choose which objects to keep in a zone when over limit.
	 * Returns a list of object IDs TO DISCARD/SACRIFICE.
	 * This is a simulation for now. A real implementation would involve player input.
	 * Rule 4.2.5.c
	 */
	public async playerChoosesObjectsToKeep(
		playerId: string,
		objectsInZone: IGameObject[],
		limit: number,
		zoneType: 'reserve' | 'landmark' // To slightly customize logging if needed
	): Promise<string[]> { // Returns IDs of objects to discard/sacrifice
		console.log(`[PlayerActionHandler] Player ${playerId} choosing for ${zoneType} zone. Have ${objectsInZone.length}, limit ${limit}.`);

		if (objectsInZone.length <= limit) {
			return []; // No objects to discard
		}

		// Simulate keeping the first 'limit' objects based on current sort (e.g., timestamp or how they were passed)
		// or a simple sort by timestamp if not already sorted. This matches a common simple AI approach.
		// A real implementation would prompt the player.
		// For this simulation, we'll sort by timestamp (older first are less likely to be discarded by this naive simulation).
		// The GameStateManager currently pre-sorts them by cost/timestamp for its deterministic logic;
		// if that sort is maintained before calling this, this simulation would discard the lowest value items.
		// For robustness, let's assume objectsInZone might not be pre-sorted in a specific way the player desires.
		// A simple simulation: keep the objects with the smallest timestamps.
		const sortedObjects = [...objectsInZone].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

		const objectsToKeep = sortedObjects.slice(0, limit);
		const objectsToDiscard = sortedObjects.slice(limit);

		const keptIds = objectsToKeep.map(obj => obj.objectId);
		const discardIds = objectsToDiscard.map(obj => obj.objectId);

		console.log(`[PlayerActionHandler] Player ${playerId} (simulated) keeping in ${zoneType}: ${objectsToKeep.map(o => o.name + '(' + o.objectId.substring(0,3) + ')').join(', ')}`);
		console.log(`[PlayerActionHandler] Player ${playerId} (simulated) discarding from ${zoneType}: ${objectsToDiscard.map(o => o.name + '(' + o.objectId.substring(0,3) + ')').join(', ')}`);

		return discardIds;
	}

	/**
	 * Prompts the player to choose a card to Expand or to skip expanding.
	 * For this subtask, simulates the choice.
	 * Rule 4.2.1.e
	 */
	public async promptPlayerForExpandChoice(playerId: string): Promise<{ cardToExpandId: string | null }> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			console.warn(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} not found.`);
			return { cardToExpandId: null };
		}

		const handCards = player.zones.handZone.getAll();
		if (handCards.length === 0) {
			console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} has no cards in hand to expand.`);
			return { cardToExpandId: null };
		}

		// Simulate player decision (50% chance to expand)
		if (Math.random() < 0.5) {
			console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} (simulated) chose NOT to expand.`);
			return { cardToExpandId: null };
		}

		// Simulate choosing a random card
		const randomIndex = Math.floor(Math.random() * handCards.length);
		const chosenCard = handCards[randomIndex];
		// Card in hand can be ICardInstance or IGameObject. We need instanceId for executeExpandAction if it's ICardInstance.
		const chosenCardId = isGameObject(chosenCard) ? chosenCard.objectId : chosenCard.instanceId;

		console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} (simulated) chose to expand card: ${chosenCard.definitionId} (ID: ${chosenCardId}).`);
		return { cardToExpandId: chosenCardId };
	}
}

export interface PlayerAction {
	type: 'playCard' | 'quickAction' | 'pass' | 'convertManaOrb' | 'expandMana';
	cardId?: string;
	cardDefinitionId?: string;
	zone?: ZoneIdentifier | string;
	cost?: number;
	abilityId?: string;
	sourceObjectId?: string;
	selectedExpeditionType?: 'hero' | 'companion';
	targets?: TargetInfo[];
	sourceOrbId?: string;
	targetOrbId?: string;
	description: string;
	cardToExpandId?: string;
}

export type PlayerActionType = PlayerAction['type'];
