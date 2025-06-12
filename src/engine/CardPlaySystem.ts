import type { GameStateManager } from './GameStateManager';
import type { EventBus } from './EventBus';
import {
	ZoneIdentifier,
	GamePhase,
	CardType,
	StatusType,
	KeywordAbility,
	PermanentZoneType
} from './types/enums';
import type { IGameObject, ICardInstance } from './types/objects'; // Assuming ICardInstance and IGameObject are relevant

// Define CardPlayOptions here for now, or move to a central types file later
import type { ICost } from './types/abilities';

export interface CardPlayOptions {
	targetIds?: string[];
	mode?: number | string;
	chosenCost?: ICost | undefined;
	expeditionChoice?: 'hero' | 'companion';
	fromZone: ZoneIdentifier; // e.g., ZoneIdentifier.Hand, ZoneIdentifier.Reserve
}

export class CardPlaySystem {
	private gsm: GameStateManager;
	private eventBus: EventBus;

	constructor(gameStateManager: GameStateManager, eventBus: EventBus) {
		this.gsm = gameStateManager;
		this.eventBus = eventBus;
		// If GameStateManager needs a reference back:
		// this.gsm.cardPlaySystem = this;
	}

	/**
	 * Initiates playing a card according to Rule 5.1.2.
	 */
	public async playCard(
		playerId: string,
		cardInstanceId: string,
		options: CardPlayOptions
	): Promise<void> {
		console.log(
			`[CardPlaySystem] Player ${playerId} attempts to play card ${cardInstanceId} from ${options.fromZone} with options:`,
			options
		);

		const player = this.gsm.getPlayer(playerId); // Assumes gsm.getPlayer() exists
		if (!player) {
			console.error(`[CardPlaySystem] Player ${playerId} not found.`);
			this.eventBus.publish('cardPlayFailed', {
				playerId,
				cardInstanceId,
				options,
				error: 'Player not found'
			});
			return;
		}

		const sourceZoneObject = this.gsm.getZoneByIdentifier(options.fromZone, playerId);
		if (!sourceZoneObject) {
			console.error(
				`[CardPlaySystem] Source zone ${options.fromZone} not found for player ${playerId}.`
			);
			this.eventBus.publish('cardPlayFailed', {
				playerId,
				cardInstanceId,
				options,
				error: `Source zone ${options.fromZone} not found`
			});
			return;
		}

		const cardInstance = sourceZoneObject.findById(cardInstanceId) as
			| ICardInstance
			| IGameObject
			| undefined; // Assuming findById returns the entity
		if (!cardInstance) {
			console.error(
				`[CardPlaySystem] Card ${cardInstanceId} not found in player ${playerId}'s ${options.fromZone}.`
			);
			this.eventBus.publish('cardPlayFailed', {
				playerId,
				cardInstanceId,
				options,
				error: `Card ${cardInstanceId} not found in ${options.fromZone}`
			});
			return;
		}

		const cardDefinition = this.gsm.getCardDefinition(cardInstance.definitionId);
		if (!cardDefinition) {
			console.error(
				`[CardPlaySystem] Card definition ${cardInstance.definitionId} not found for card ${cardInstanceId}.`
			);
			this.eventBus.publish('cardPlayFailed', {
				playerId,
				cardInstanceId,
				options,
				error: `Card definition ${cardInstance.definitionId} not found`
			});
			return;
		}

		// Legality Checks (Rule 5.1.2.f - though some checks are done earlier, Rule 5.1.1)
		if (this.gsm.state.currentPlayerId !== playerId) {
			console.error(`[CardPlaySystem] Legality Check Failed: Not player ${playerId}'s turn.`);
			this.eventBus.publish('cardPlayFailed', {
				playerId,
				cardInstanceId,
				definitionId: cardDefinition.id,
				options,
				error: "Not player's turn"
			});
			return;
		}
		if (this.gsm.state.currentPhase !== GamePhase.Afternoon) {
			console.error(
				`[CardPlaySystem] Legality Check Failed: Can only play cards in Afternoon phase. Current: ${this.gsm.state.currentPhase}`
			);
			this.eventBus.publish('cardPlayFailed', {
				playerId,
				cardInstanceId,
				definitionId: cardDefinition.id,
				options,
				error: 'Not Afternoon phase'
			});
			return;
		}
		// Basic ownership check for cards from hand/reserve
		if (options.fromZone === ZoneIdentifier.Hand || options.fromZone === ZoneIdentifier.Reserve) {
			if (cardInstance.ownerId !== playerId) {
				console.error(
					`[CardPlaySystem] Legality Check Failed: Player ${playerId} does not own card ${cardInstanceId}.`
				);
				this.eventBus.publish('cardPlayFailed', {
					playerId,
					cardInstanceId,
					definitionId: cardDefinition.id,
					options,
					error: 'Player does not own card'
				});
				return;
			}
		}
		// TODO: More legality checks: Can play from zone? Targets valid? Modes valid? etc.

		console.log(
			`[CardPlaySystem] Player ${playerId} declared intent to play ${cardDefinition.name} (ID: ${cardInstanceId}). Targets: ${options.targetIds}, Mode: ${options.mode}`
		);

		// Move to Limbo (Rule 5.1.2.g)
		const limboZone = this.gsm.state.sharedZones.limbo;
		const limboCardObject = this.gsm.moveEntity(
			cardInstanceId,
			sourceZoneObject,
			limboZone,
			playerId
		) as IGameObject | null;

		if (!limboCardObject) {
			console.error(`[CardPlaySystem] Failed to move card ${cardInstanceId} to Limbo.`);
			// eventBus publish handled by moveEntity or subsequent failures
			return;
		}
		console.log(
			`[CardPlaySystem] Card ${cardDefinition.name} (Limbo ID: ${limboCardObject.id}) moved to Limbo.`
		);

		// Fleeting Status Application (Rules 5.2.1.b, 5.2.2.b, 5.2.3 remark, 5.2.4.a)
		let appliedFleeting = false;
		if (options.fromZone === ZoneIdentifier.Reserve) {
			if (
				!(
					limboCardObject.type === CardType.Permanent &&
					limboCardObject.permanentZoneType === PermanentZoneType.Landmark
				)
			) {
				this.gsm.statusHandler.applyStatusEffect(limboCardObject, StatusType.Fleeting);
				console.log(
					`[CardPlaySystem] Applied Fleeting to ${limboCardObject.name} (played from Reserve).`
				);
				appliedFleeting = true;
			}
		}

		if (!appliedFleeting && limboCardObject.type === CardType.Spell) {
			// Check for intrinsic Fleeting keyword on the spell definition
			if (
				cardDefinition.abilities.some(
					(ab) => ab.keyword === KeywordAbility.Fleeting && ab.abilityType === 'passive'
				)
			) {
				// Make sure it's a passive keyword
				this.gsm.statusHandler.applyStatusEffect(limboCardObject, StatusType.Fleeting);
				console.log(
					`[CardPlaySystem] Applied Fleeting to Spell ${limboCardObject.name} (intrinsic keyword).`
				);
			}
			// Rule 5.2.4.a.3: Passive ability (including Emblem-Ongoing) grants/loses Fleeting
			// TODO: Query GSM for passive abilities affecting Fleeting status of limboCardObject.id
			// const passiveFleetingModifiers = this.gsm.getPassiveFleetingModifiers(limboCardObject.id, limboCardObject.definitionId);
			// For now, simulate one modifier. In a real scenario, loop through all relevant modifiers.
			// This simulation can be triggered by specific card IDs or names for testing if needed.
			const simulatePassiveModifier = true; // Set to true to test this logic path

			if (simulatePassiveModifier) {
				// Example: Simulate a passive effect that grants Fleeting
				// const simulatedModifier = { effect: 'gain', status: StatusType.Fleeting, source: 'Emblem of Evanescence' };
				// Example: Simulate a passive effect that removes Fleeting
				const simulatedModifier = { effect: 'lose', status: StatusType.Fleeting, source: 'Amulet of Permanence' };


				if (simulatedModifier.effect === 'gain' && simulatedModifier.status === StatusType.Fleeting) {
					this.gsm.statusHandler.applyStatusEffect(limboCardObject, StatusType.Fleeting);
					console.log(
						`[CardPlaySystem] Applied Fleeting to Spell ${limboCardObject.name} due to passive effect from ${simulatedModifier.source}.`
					);
				} else if (simulatedModifier.effect === 'lose' && simulatedModifier.status === StatusType.Fleeting) {
					// Check if it even has Fleeting to remove (e.g. from Reserve or intrinsic)
					if (this.gsm.statusHandler.hasStatus(limboCardObject, StatusType.Fleeting)) {
						this.gsm.statusHandler.removeStatusEffect(limboCardObject, StatusType.Fleeting);
						console.log(
							`[CardPlaySystem] Removed Fleeting from Spell ${limboCardObject.name} due to passive effect from ${simulatedModifier.source}.`
						);
					} else {
						console.log(
							`[CardPlaySystem] Passive effect from ${simulatedModifier.source} attempts to remove Fleeting from ${limboCardObject.name}, but it does not have Fleeting.`
						);
					}
				}
			}
		}

		// TODO: Rule 5.1.2.h: Pay Costs
		console.log(`[CardPlaySystem] TODO: Implement Pay Costs for ${limboCardObject.name}.`);

		// TODO: Rule 5.1.2.i: Resolve Card (Move to final zone, process effects)
		console.log(`[CardPlaySystem] TODO: Implement Resolve Card for ${limboCardObject.name}.`);

		// For now, publish a generic event. This will be refined once costs/resolution are added.
		this.eventBus.publish('cardPlayed', {
			playerId,
			cardId: limboCardObject.id, // Using limbo object ID
			definitionId: cardDefinition.id,
			options,
			message: `${cardDefinition.name} play process initiated and moved to Limbo.`
		});
	}
}
