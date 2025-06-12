import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance, IEmblemObject } from './types/objects';
import { GamePhase, CardType, StatusType } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Handles player actions during Afternoon turns
 * Rule 4.2.3 - Afternoon turn structure
 */
export class PlayerActionHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Gets available actions for a player during their turn
	 * Rule 4.2.3.d - Players can play a card, play a quick action, or pass
	 */
	public getAvailableActions(playerId: string): PlayerAction[] {
		if (this.gsm.state.currentPhase !== GamePhase.Afternoon) {
			return [];
		}

		if (this.gsm.state.currentPlayerId !== playerId) {
			return [];
		}

		const actions: PlayerAction[] = [];

		// Always can pass
		actions.push({
			type: 'pass',
			description: 'Pass turn'
		});

		// Check playable cards from hand
		const playableCards = this.getPlayableCardsFromHand(playerId);
		for (const card of playableCards) {
			actions.push({
				type: 'playCard',
				cardId: card.instanceId,
				zone: 'hand',
				description: `Play ${card.definitionId} from hand`
			});
		}

		// Check playable cards from reserve
		const playableFromReserve = this.getPlayableCardsFromReserve(playerId);
		for (const card of playableFromReserve) {
			actions.push({
				type: 'playCard',
				cardId: card.objectId,
				zone: 'reserve',
				description: `Play ${card.name} from reserve`
			});
		}

		// Check available quick actions
		const quickActions = this.getAvailableQuickActions(playerId);
		for (const action of quickActions) {
			actions.push(action);
		}

		// Add Mana Conversion actions (Rule 3.2.9.e)
		// Rule 3.2.9.e: "Players can exhaust a Mana Orb to ready another exhausted Mana
		// Orb in their Mana zone before any step that ask them to choose one of their Mana Orbs."
		// Assuming this is available if it's the player's turn.
		if (this.gsm.state.currentPlayerId === playerId) {
			const player = this.gsm.getPlayer(playerId);
			if (player) {
				const manaZone = player.zones.manaZone;
				const allManaOrbs = manaZone.getAll().filter(isGameObject);
				const readyOrbs = allManaOrbs.filter(orb => !orb.statuses.has(StatusType.Exhausted));
				const exhaustedOrbs = allManaOrbs.filter(orb => orb.statuses.has(StatusType.Exhausted));

				for (const readyOrb of readyOrbs) {
					for (const exhaustedOrb of exhaustedOrbs) {
						if (readyOrb.objectId !== exhaustedOrb.objectId) { // Cannot convert an orb with itself
							actions.push({
								type: 'convertManaOrb',
								sourceOrbId: readyOrb.objectId,
								targetOrbId: exhaustedOrb.objectId,
								description: `Exhaust ${readyOrb.name || 'Orb'} (ID: ${readyOrb.objectId.substring(0,3)}) to ready ${exhaustedOrb.name || 'Orb'} (ID: ${exhaustedOrb.objectId.substring(0,3)})`
							});
						}
					}
				}
			}
		}

		return actions;
	}

	/**
	 * Executes a player action
	 * Rule 4.2.3.e - After action, turn continues or ends based on action type
	 */
	public async executeAction(playerId: string, action: PlayerAction): Promise<boolean> {
		if (this.gsm.state.currentPlayerId !== playerId) {
			throw new Error(`Not ${playerId}'s turn`);
		}

		let turnEnds = false; // Default to false, specific actions will set it to true

		switch (action.type) {
			case 'pass':
				this.gsm.turnManager.playerPasses(playerId);
				console.log(`[PlayerAction] ${playerId} passed their turn`);
				turnEnds = true;
				break;

			case 'playCard':
				if (!action.cardId || !action.zone) {
					throw new Error('Action playCard missing cardId or zone.');
				}
				await this.playCard(playerId, action.cardId, action.zone);
				console.log(`[PlayerAction] ${playerId} played a card`);
				turnEnds = true; // Turn ends after playing a card
				break;

			case 'quickAction':
				if (!action.abilityId || !action.sourceObjectId) {
					throw new Error('Action quickAction missing abilityId or sourceObjectId.');
				}
				await this.executeQuickAction(playerId, action.abilityId, action.sourceObjectId);
				console.log(`[PlayerAction] ${playerId} used a quick action`);
				turnEnds = false; // Turn continues after quick action
				break;

			case 'convertManaOrb':
				if (!action.sourceOrbId || !action.targetOrbId) {
					throw new Error('Action convertManaOrb missing sourceOrbId or targetOrbId.');
				}
				const converted = this.gsm.manaSystem.convertMana(playerId, action.sourceOrbId, action.targetOrbId);
				if (!converted) {
					console.warn(`[PlayerActionHandler] Mana conversion failed for player ${playerId}, source ${action.sourceOrbId}, target ${action.targetOrbId}`);
				} else {
					console.log(`[PlayerActionHandler] ${playerId} converted mana: exhausted ${action.sourceOrbId} to ready ${action.targetOrbId}`);
				}
				turnEnds = false; // Does not end the main turn action sequence
				break;

			default:
				throw new Error(`Unknown action type: ${(action as PlayerAction).type}`);
		}

		// After any action, resolve reactions (Rule 4.4.a.3)
		await this.gsm.resolveReactions();

		return turnEnds;
	}

	/**
	 * Gets cards that can be played from hand
	 * Rule 5.1.1, 5.2 - Card playing requirements
	 */
	private getPlayableCardsFromHand(playerId: string): ICardInstance[] {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const playableCards: ICardInstance[] = [];

		for (const card of player.zones.hand.getAll()) {
			if (this.canPlayCardFromHand(playerId, card as ICardInstance)) {
				playableCards.push(card as ICardInstance);
			}
		}

		return playableCards;
	}

	/**
	 * Gets cards that can be played from reserve
	 * Rule 2.4.5.c-d - Playing from Reserve
	 */
	private getPlayableCardsFromReserve(playerId: string): IGameObject[] {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const playableCards: IGameObject[] = [];

		for (const entity of player.zones.reserveZone.getAll()) {
			if (isGameObject(entity) && this.canPlayCardFromReserve(playerId, entity)) {
				playableCards.push(entity);
			}
		}

		return playableCards;
	}

	/**
	 * Checks if a card can be played from hand
	 */
	private canPlayCardFromHand(playerId: string, card: ICardInstance): boolean {
		const definition = this.gsm.getCardDefinition(card.definitionId);
		if (!definition) return false;

		// Check if player can pay hand cost
		return this.canPayManaCost(playerId, definition.handCost);
	}

	/**
	 * Checks if a card can be played from reserve
	 * Rule 2.4.5.c-d
	 */
	private canPlayCardFromReserve(playerId: string, object: IGameObject): boolean {
		// Can't play exhausted cards from reserve
		if (object.statuses.has(StatusType.Exhausted)) {
			return false;
		}

		const definition = this.gsm.getCardDefinition(object.definitionId);
		if (!definition) return false;

		// Check if player can pay reserve cost
		return this.canPayManaCost(playerId, definition.reserveCost);
	}

	/**
	 * Checks if player can pay mana cost
	 * Rule 1.2.5.e - Mana cost paid by exhausting Mana Orbs
	 */
	private canPayManaCost(playerId: string, cost: number): boolean {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return false;

		// Count ready mana orbs
		let readyManaOrbs = 0;
		for (const entity of player.zones.manaZone.getAll()) {
			if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
				readyManaOrbs++;
			}
		}

		return readyManaOrbs >= cost;
	}

	/**
	 * Plays a card from specified zone
	 */
	private async playCard(playerId: string, cardId: string, fromZone: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found`);

		let sourceZone;
		let isFromReserve = false;

		switch (fromZone) {
			case 'hand':
				sourceZone = player.zones.hand;
				break;
			case 'reserve':
				sourceZone = player.zones.reserve;
				isFromReserve = true;
				break;
			default:
				throw new Error(`Cannot play card from zone: ${fromZone}`);
		}

		const card = sourceZone.findById(cardId);
		if (!card) throw new Error(`Card ${cardId} not found in ${fromZone}`);

		const definition = this.gsm.getCardDefinition(card.definitionId);
		if (!definition) throw new Error(`Definition not found for ${card.definitionId}`);

		// Pay cost
		const cost = isFromReserve ? definition.reserveCost : definition.handCost;
		await this.payManaCost(playerId, cost);

		// Determine destination zone based on card type
		let destinationZone;
		switch (definition.type) {
			case CardType.Character:
				destinationZone = player.zones.expedition;
				break;
			case CardType.Permanent:
				destinationZone =
					definition.permanentZoneType === 'Landmark'
						? player.zones.landmarkZone
						: player.zones.expedition;
				break;
			case CardType.Spell:
				// Spells resolve and may go to Reserve or discard
				destinationZone = player.zones.reserve; // Simplified
				break;
			default:
				throw new Error(`Cannot play card type: ${definition.type}`);
		}

		// Move card
		this.gsm.moveEntity(cardId, sourceZone, destinationZone, playerId);

		// Handle Fleeting status for cards played from Reserve
		if (isFromReserve && isGameObject(card)) {
			card.statuses.add(StatusType.Fleeting);
		}
	}

	/**
	 * Pays mana cost by exhausting mana orbs
	 */
	private async payManaCost(playerId: string, cost: number): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found`);

		let remainingCost = cost;

		for (const entity of player.zones.manaZone.getAll()) {
			if (remainingCost <= 0) break;

			if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
				entity.statuses.add(StatusType.Exhausted);
				remainingCost--;
				console.log(`[PlayerAction] Exhausted mana orb for ${playerId}`);
			}
		}

		if (remainingCost > 0) {
			throw new Error(`Insufficient mana: needed ${cost}, could only pay ${cost - remainingCost}`);
		}
	}

	/**
	 * Gets available quick actions
	 */
	private getAvailableQuickActions(playerId: string): PlayerAction[] {
		const availableQuickActions: PlayerAction[] = [];
		const activationLimit = 100; // Rule 1.4.6.c
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		for (const zone of this.gsm.getAllVisibleZones()) {
			const playerObjects = zone.getAll().filter(
				(e): e is IGameObject => isGameObject(e) && e.controllerId === playerId
			);

			for (const sourceObject of playerObjects) {
				for (const ability of sourceObject.abilities) {
					if (ability.abilityType !== 'QuickAction') { // Corrected enum: AbilityType.QuickAction
						continue;
					}

					const currentActivations = sourceObject.abilityActivationsToday?.get(ability.abilityId) || 0;
					if (currentActivations >= activationLimit) {
						continue;
					}

					// Check costs
					let canPayAllCosts = true;
					if (ability.cost) {
						if (ability.cost.mana && ability.cost.mana > 0) {
							if (!this.canPayManaCost(playerId, ability.cost.mana)) {
								canPayAllCosts = false;
							}
						}
						if (ability.cost.exhaustSelf) {
							if (sourceObject.statuses.has(StatusType.Exhausted)) {
								canPayAllCosts = false;
							}
						}
						if (ability.cost.discardSelfFromReserve) {
							// Check if the object is in the player's reserve zone
							const objectZone = this.gsm.findZoneOfObject(sourceObject.objectId);
							if (!objectZone || objectZone.id !== player.zones.reserveZone.id) {
								canPayAllCosts = false;
							}
							// As per canPlayCardFromReserve, exhausted cards in reserve generally can't be used for abilities
							// that involve discarding them or activating them.
							if (sourceObject.statuses.has(StatusType.Exhausted)) {
								canPayAllCosts = false;
							}
						}
						// Add other cost checks here as ICost expands (e.g., sacrifice, spendCounters)
					}

					if (canPayAllCosts) {
						availableQuickActions.push({
							type: 'quickAction',
							abilityId: ability.abilityId,
							sourceObjectId: sourceObject.objectId,
							description: `Use Quick Action: ${ability.text || ability.abilityId} from ${sourceObject.name}`
						});
					}
				}
			}
		}
		return availableQuickActions;
	}

	/**
	 * Executes a quick action
	 */
	private async executeQuickAction(
		playerId: string,
		abilityId: string,
		sourceObjectId: string
	): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		const sourceObject = this.gsm.getObject(sourceObjectId);
		if (!player || !sourceObject) {
			throw new Error(`Player or Source object ${sourceObjectId} not found for quick action.`);
		}
		if (sourceObject.controllerId !== playerId) {
			throw new Error(`Player ${playerId} does not control source object ${sourceObjectId} for quick action.`);
		}

		const ability = sourceObject.abilities.find(a => a.abilityId === abilityId);
		if (!ability) {
			throw new Error(`Ability ${abilityId} not found on source object ${sourceObjectId}.`);
		}
		if (ability.abilityType !== 'QuickAction') { // Corrected enum: AbilityType.QuickAction
			throw new Error(`Ability ${abilityId} is not a QuickAction.`);
		}

		// Check activation limit (already checked by getAvailableQuickActions, but good for safety)
		const activationLimit = 100; // Rule 1.4.6.c
		const currentActivations = sourceObject.abilityActivationsToday?.get(abilityId) || 0;
		if (currentActivations >= activationLimit) {
			throw new Error(`Quick action ${abilityId} on ${sourceObjectId} has reached its daily limit.`);
		}

		// Pay Costs
		if (ability.cost) {
			if (ability.cost.mana && ability.cost.mana > 0) {
				if (!this.canPayManaCost(playerId, ability.cost.mana)) { // Double check before paying
					throw new Error(`Cannot pay mana cost for quick action ${abilityId} from ${sourceObjectId}.`);
				}
				await this.payManaCost(playerId, ability.cost.mana);
				console.log(`[PlayerActionHandler] Paid ${ability.cost.mana} mana for quick action ${abilityId} from ${sourceObject.name}.`);
			}
			if (ability.cost.exhaustSelf) {
				if (sourceObject.statuses.has(StatusType.Exhausted)) { // Double check
					throw new Error(`Source object ${sourceObjectId} is already exhausted for quick action ${abilityId}.`);
				}
				sourceObject.statuses.add(StatusType.Exhausted);
				console.log(`[PlayerActionHandler] Exhausted ${sourceObject.name} for quick action ${abilityId}.`);
			}
			if (ability.cost.discardSelfFromReserve) {
				const objectZone = this.gsm.findZoneOfObject(sourceObject.objectId);
				if (!objectZone || objectZone.id !== player.zones.reserveZone.id) {
					throw new Error(`Source object ${sourceObjectId} is not in reserve for discardSelfFromReserve cost.`);
				}
				// No need to check for exhausted status here again if getAvailableQuickActions did it,
				// but if it could change, a check might be warranted.
				this.gsm.moveEntity(sourceObject.objectId, player.zones.reserveZone, player.zones.discardPile, playerId);
				console.log(`[PlayerActionHandler] Discarded ${sourceObject.name} from reserve for quick action ${abilityId}.`);
				// After discarding, the sourceObject reference might be stale or point to an object in discard.
				// The effect should resolve based on LKI if needed.
			}
			// Add other cost payments here
		}

		// Increment activation count
		if (!sourceObject.abilityActivationsToday) {
			sourceObject.abilityActivationsToday = new Map<string, number>();
		}
		sourceObject.abilityActivationsToday.set(abilityId, currentActivations + 1);
		console.log(`[PlayerActionHandler] Incremented quick action count for ${abilityId} on ${sourceObject.name} to ${currentActivations + 1}`);

		// Resolve Effect
		console.log(`[PlayerActionHandler] Executing Quick Action effect: ${ability.text || abilityId} from ${sourceObject.name}`);
		// Ensure sourceObject passed to resolveEffect is the state *before* paying costs like discardSelf.
		// If discardSelfFromReserve was paid, sourceObject is now in the discard pile.
		// EffectProcessor needs to handle LKI (Last Known Information) if the effect relies on the source object's prior state.
		// For now, we pass the potentially modified sourceObject (e.g. now exhausted).
		// If it was discarded, the original sourceObject reference is what we have, but it's no longer in its original zone.
		// This detail is important for effect resolution.
		await this.gsm.effectProcessor.resolveEffect(ability.effect, sourceObject /*, potentialTargets */);

		// Note: If discardSelfFromReserve was paid, sourceObject is no longer in its original zone.
		// The effect resolution must be robust to this.
	}

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
}

export interface PlayerAction {
	type: 'playCard' | 'quickAction' | 'pass' | 'convertManaOrb' | 'expandMana';
	cardId?: string;
	zone?: string;
	abilityId?: string;
	sourceObjectId?: string;
	sourceOrbId?: string; // For convertManaOrb
	targetOrbId?: string; // For convertManaOrb
	description: string;
	cardToExpandId?: string; // For expandMana
}

export type PlayerActionType = PlayerAction['type'];
