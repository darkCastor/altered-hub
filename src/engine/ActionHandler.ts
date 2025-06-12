import type { GameStateManager } from './GameStateManager';
import type { TurnManager } from './TurnManager';
import type { ReactionManager } from './ReactionManager';
import { CostProcessor } from './CostProcessor';
import { EffectResolver } from './EffectResolver';
import type { IZone } from './types/zones';
import type { ICardInstance } from './types/cards';
import type { ICost } from './types/abilities';
import { CardType, StatusType, ZoneIdentifier, PermanentZoneType, GamePhase } from './types/enums';
import { isGameObject } from './types/objects';
import type { IGameObject } from './types/objects';

/**
 * Handles high-level player actions, orchestrating the various managers
 * and processors to ensure rules are followed.
 */
export class ActionHandler {
	private gsm: GameStateManager;
	private turnManager: TurnManager;
	private reactionManager: ReactionManager;
	private costProcessor: CostProcessor;
	private effectResolver: EffectResolver;

	constructor(gsm: GameStateManager, turnManager: TurnManager, reactionManager: ReactionManager) {
		this.gsm = gsm;
		this.turnManager = turnManager;
		this.reactionManager = reactionManager;
		this.effectResolver = new EffectResolver(gsm);
		this.costProcessor = new CostProcessor(gsm);
	}

	/**
	 * Executes the complex process of a player playing a card from their hand.
	 * Follows the procedure outlined in Rule 5.1.2.
	 * @param playerId The ID of the player performing the action.
	 * @param cardInstanceId The ID of the card instance in the player's hand.
	 * @param _expeditionId The target expedition, if the card is a Character or Expedition Permanent. (Currently unused)
	 */
	public async tryPlayCardFromHand(
		playerId: string,
		cardInstanceId: string,
		_expeditionId?: string
	): Promise<void> {
		console.log(
			`[ActionHandler] Player ${playerId} is attempting to play card ${cardInstanceId} from hand.`
		);

		// --- 1. Validation and Declaration of Intent ---
		const player = this.gsm.getPlayer(playerId);
		if (!player || this.gsm.state.currentPlayerId !== playerId) {
			throw new Error(`It is not ${playerId}'s turn.`);
		}

		const cardInstance = player.zones.hand.findById(cardInstanceId) as ICardInstance;
		if (!cardInstance) {
			throw new Error(`Card ${cardInstanceId} not found in player's hand.`);
		}

		const definition = this.gsm.getCardDefinition(cardInstance.definitionId);
		if (!definition) {
			throw new Error(`Card definition not found for ${cardInstance.definitionId}.`);
		}

		const cost: ICost = { mana: definition.handCost };

		if (!this.costProcessor.canPay(playerId, cost)) {
			throw new Error(`Player ${playerId} cannot pay the costs for ${definition.name}.`);
		}
		console.log(`[ActionHandler] Intent to play ${definition.name} is valid.`);

		// --- 2. Move to Limbo (Rule 5.1.2.g) ---
		const limboMoveResult = this.gsm.moveEntity(
			cardInstance.instanceId,
			player.zones.hand,
			this.gsm.state.sharedZones.limbo,
			playerId
		);
		if (!limboMoveResult) {
			throw new Error(`Card ${cardInstance.instanceId} could not be moved to Limbo.`);
		}
		const limboMovePayload = {
			entity: limboMoveResult,
			from: player.zones.hand,
			to: this.gsm.state.sharedZones.limbo
		};
		this.reactionManager.checkForTriggers('entityMoved', limboMovePayload);
		await this.reactionManager.processReactions();

		const objectInLimboId = isGameObject(limboMoveResult)
			? limboMoveResult.objectId
			: limboMoveResult.instanceId;
		const objectInLimbo = this.gsm.state.sharedZones.limbo.findById(objectInLimboId);

		if (!objectInLimbo || !isGameObject(objectInLimbo)) {
			console.warn(
				`[ActionHandler] Card ${definition.name} was removed from Limbo by a reaction before it could resolve. Aborting action.`
			);
			this.turnManager.advanceTurn();
			return;
		}

		// --- 3. Pay Costs (Rule 5.1.2.h) ---
		if (!this.costProcessor.canPay(playerId, cost)) {
			console.error(
				`[ActionHandler] Cost became unpayable after reactions. Returning card to hand.`
			);
			this.gsm.moveEntity(
				objectInLimbo.objectId,
				this.gsm.state.sharedZones.limbo,
				player.zones.hand,
				playerId
			);
			return;
		}
		this.costProcessor.pay(playerId, cost);
		console.log(`[ActionHandler] Costs for ${definition.name} paid.`);

		// --- 4. Resolution (Rule 5.1.2.i) ---
		let finalDestinationZone: IZone;
		switch (definition.type) {
			case CardType.Character: {
				const targetExpedition = player.zones.expedition;
				if (!targetExpedition) {
					this.gsm.moveEntity(
						objectInLimbo.objectId,
						this.gsm.state.sharedZones.limbo,
						player.zones.hand,
						playerId
					);
					throw new Error(`Target expedition for player ${playerId} not found.`);
				}
				finalDestinationZone = targetExpedition;
				break;
			}
			case CardType.Permanent: {
				if (definition.permanentZoneType === PermanentZoneType.Landmark) {
					finalDestinationZone = player.zones.landmarkZone;
				} else if (definition.permanentZoneType === PermanentZoneType.Expedition) {
					finalDestinationZone = player.zones.expedition;
				} else {
					this.gsm.moveEntity(
						objectInLimbo.objectId,
						this.gsm.state.sharedZones.limbo,
						player.zones.hand,
						playerId
					);
					throw new Error(`Unknown permanent zone type for ${definition.name}.`);
				}
				break;
			}
			case CardType.Spell: {
				// Rule 2.4.6.e / 5.2.4.b: Fleeting spells are discarded instead of going to Reserve.
				const isFleeting = objectInLimbo.statuses.has(StatusType.Fleeting);
				finalDestinationZone = isFleeting ? player.zones.discardPile : player.zones.reserve;
				break;
			}
			default: {
				this.gsm.moveEntity(
					objectInLimbo.objectId,
					this.gsm.state.sharedZones.limbo,
					player.zones.hand,
					playerId
				);
				throw new Error(`Unknown card type resolution: ${definition.type}.`);
			}
		}
		const finalMoveResult = this.gsm.moveEntity(
			objectInLimbo.objectId,
			this.gsm.state.sharedZones.limbo,
			finalDestinationZone,
			playerId
		);

		// Rule 7.4.1.b / 5.2.4.b: A non-Fleeting spell with Cooldown enters Reserve exhausted.
		if (finalMoveResult && isGameObject(finalMoveResult) && definition.type === CardType.Spell) {
			const hasCooldown = definition.abilities.some((a) => a.keyword === 'Cooldown');
			if (hasCooldown && finalDestinationZone.zoneType === ZoneIdentifier.Reserve) {
				finalMoveResult.statuses.add(StatusType.Exhausted);
				console.log(
					`[ActionHandler] Spell ${definition.name} entered Reserve exhausted due to Cooldown.`
				);
			}
		}

		console.log(
			`[ActionHandler] ${definition.name} is moving from Limbo to ${finalDestinationZone.zoneType}.`
		);
		console.log(`[ActionHandler] Action to play ${definition.name} is complete.`);

		// --- 5. End of Turn Effect ---
		this.turnManager.advanceTurn();
	}

	public async tryExpand(playerId: string, cardInstanceId: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found.`);
		if (this.gsm.state.currentPhase !== GamePhase.Morning) {
			throw new Error('Expand can only be performed during the Morning phase.');
		}
		if (player.hasExpandedThisTurn) {
			throw new Error('You have already expanded this turn.');
		}

		const cardToExpand = player.zones.hand.findById(cardInstanceId);
		if (!cardToExpand) {
			throw new Error(`Card ${cardInstanceId} not found in hand.`);
		}

		console.log(`[ActionHandler] Player ${playerId} is expanding card ${cardInstanceId}.`);

		const manaObject = this.gsm.moveEntity(
			cardInstanceId,
			player.zones.hand,
			player.zones.manaZone,
			playerId
		) as IGameObject;
		if (manaObject) {
			// Rule 4.2.1.e: The Mana Orb enters ready.
			if (manaObject.statuses.has(StatusType.Exhausted)) {
				manaObject.statuses.delete(StatusType.Exhausted);
				console.log(`[ActionHandler] Mana Orb ${manaObject.objectId} was made ready.`);
			}
		}
		player.hasExpandedThisTurn = true;
	}

	public async trySkipExpand(playerId: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found.`);
		if (this.gsm.state.currentPhase !== GamePhase.Morning) {
			throw new Error('Can only skip expand during the Morning phase.');
		}
		if (player.hasExpandedThisTurn) {
			throw new Error('You have already made your expand decision this turn.');
		}

		console.log(`[ActionHandler] Player ${playerId} has skipped their expand action.`);
		player.hasExpandedThisTurn = true;
	}
	/**
	 * Handles a player passing their turn.
	 * @param playerId The ID of the player passing.
	 */
	public async tryPass(playerId: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player || this.gsm.state.currentPlayerId !== playerId) {
			throw new Error(`It is not ${playerId}'s turn to pass.`);
		}
		if (player.hasPassedTurn) {
			throw new Error(`Player ${playerId} has already passed.`);
		}

		console.log(`[ActionHandler] Player ${playerId} passes the turn.`);
		this.turnManager.playerPasses(playerId);
		this.turnManager.advanceTurn();
	}
}
