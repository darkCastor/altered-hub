import type { IGameObject } from './types/objects';
import type { GameStateManager } from './GameStateManager';
import type { IZone } from './types/zones';
import { KeywordAbility, StatusType, CardType, AbilityType, ZoneIdentifier } from './types/enums'; // Added AbilityType, ZoneIdentifier
import { isGameObject } from './types/objects';
import type { ICost, IAbility } from './types/abilities'; // Added IAbility

/**
 * Handles all keyword ability mechanics
 * Rules 7.4.1 through 7.4.7
 */
export class KeywordAbilityHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Processes keyword abilities when an object enters play
	 * Rule 7.4 - Keywords are passive abilities
	 */
	public processKeywordOnEnterPlay(object: IGameObject, _zone: IZone): void {
		for (const ability of object.abilities) {
			if (!ability.isKeyword || !ability.keyword) continue;

			switch (ability.keyword) {
				case KeywordAbility.Gigantic:
					this.handleGiganticEnterPlay(object);
					break;
				// Other keywords don't have enter play effects
			}
		}
	}

	/**
	 * Processes keyword abilities when an object leaves play
	 */
	public processKeywordOnLeavePlay(object: IGameObject, fromZone: IZone, toZone: IZone): void {
		for (const ability of object.abilities) {
			if (!ability.isKeyword || !ability.keyword) continue;

			switch (ability.keyword) {
				case KeywordAbility.Cooldown:
					this.handleCooldownLeavePlay(object, fromZone, toZone);
					break;
				case KeywordAbility.Seasoned:
					this.handleSeasonedLeavePlay(object, fromZone, toZone);
					break;
				case KeywordAbility.Gigantic:
					this.handleGiganticLeavePlay(object);
					break;
			}
		}
	}

	/**
	 * Checks if an object can be targeted by an opponent's effect
	 * Rule 7.4.7 - Tough keyword
	 */
	public canTargetWithTough(
		object: IGameObject,
		targetingPlayerId: string,
		_effectCost?: ICost | undefined // Cost of the effect trying to target, not used for Tough's own cost
	): boolean {
		let toughValue = 0;

		// Prioritize currentCharacteristics set by RuleAdjudicator
		if (object.currentCharacteristics && typeof (object.currentCharacteristics as any).isTough === 'number') {
			toughValue = (object.currentCharacteristics as any).isTough;
		} else if (object.currentCharacteristics && (object.currentCharacteristics as any).isTough === true) {
			// If isTough is just boolean true, assume Tough 1
			toughValue = 1;
		} else {
			// Fallback to base abilities if not found in currentCharacteristics
			const toughAbilityOnDef = object.abilities.find(
				(a) => a.keyword === KeywordAbility.Tough // No need for isKeyword if checking a.keyword
			);
			if (toughAbilityOnDef && typeof toughAbilityOnDef.keywordValue === 'number') {
				toughValue = toughAbilityOnDef.keywordValue;
			} else if (toughAbilityOnDef) {
				// If keywordValue is not defined but ability exists, assume Tough 1
				toughValue = 1;
			}
		}

		if (toughValue <= 0 || object.controllerId === targetingPlayerId) {
			return true; // No Tough, or player is targeting their own object
		}

		// Opponent is targeting an object with Tough X
		console.log(`[KeywordAbilityHandler] Object ${object.name} has Tough ${toughValue}. Checking if player ${targetingPlayerId} can pay.`);

		// Check if the ManaSystem is available
		if (!this.gsm.manaSystem) {
			console.warn('[KeywordAbilityHandler.canTargetWithTough] ManaSystem not available on GSM. Cannot verify Tough cost payment. Allowing targetting by default.');
			return true; // Or false, depending on desired strictness if system is incomplete
		}

		const canPayToughCost = this.gsm.manaSystem.canPayMana(targetingPlayerId, toughValue);
		if (!canPayToughCost) {
			console.log(`[KeywordAbilityHandler] Player ${targetingPlayerId} cannot pay additional ${toughValue} mana for Tough on ${object.name}.`);
		}
		return canPayToughCost;
	}

	/**
	 * Handles Cooldown keyword (Rule 7.4.1)
	 * When a Spell with Cooldown goes to Reserve after resolution, it becomes exhausted
	 */
	private handleCooldownLeavePlay(object: IGameObject, fromZone: IZone, toZone: IZone): void {
		if (object.type === 'Sort' && toZone.zoneType === 'Reserve') {
			// Spell going to Reserve
			object.statuses.add(StatusType.Exhausted);
			console.log(`[KeywordHandler] ${object.name} gained Exhausted from Cooldown`);
		}
	}

	/**
	 * Handles Seasoned keyword (Rule 7.4.6)
	 * If a Seasoned object moves from Expedition to Reserve, it keeps its boosts
	 */
	private handleSeasonedLeavePlay(object: IGameObject, fromZone: IZone, toZone: IZone): void {
		if (fromZone.zoneType === 'Expedition' && toZone.zoneType === 'Reserve') {
			// The moveEntity method in GameStateManager already handles this
			// by checking for Seasoned and preserving boost counters
			console.log(`[KeywordHandler] ${object.name} keeps boosts due to Seasoned`);
		}
	}

	/**
	 * Handles Gigantic keyword enter play (Rule 7.4.4)
	 * A Gigantic object is present in both expeditions of its controller
	 */
	private handleGiganticEnterPlay(object: IGameObject): void {
		// The primary effect of Gigantic (being in both expeditions) is achieved by other systems
		// reading the isGigantic flag (e.g., GameStateManager.calculateExpeditionStats).
		// RuleAdjudicator ensures the isGigantic flag is set on currentCharacteristics.
		// This handler method primarily serves as a hook for any direct on-enter-play effects
		// specific to Gigantic beyond the flag, or for logging.
		// Rule 7.4.4.c, 7.4.4.d (j/h/r triggers only once) - this is handled by normal trigger processing.
		console.log(`[KeywordAbilityHandler] Gigantic ${object.name} (ID: ${object.objectId}) considered present in both controller's expeditions due to isGigantic flag.`);
	}

	/**
	 * Handles Gigantic keyword leave play
	 */
	private handleGiganticLeavePlay(object: IGameObject): void {
		// Similar to enter play, the main effect of leaving "both expeditions" is handled by the object
		// being removed from its actual zone and its isGigantic flag no longer being relevant in play.
		console.log(`[KeywordAbilityHandler] Gigantic ${object.name} (ID: ${object.objectId}) is no longer considered present in both expeditions as it leaves play.`);
	}

	/**
	 * Checks if expeditions can move (Defender keyword check)
	 * Rule 7.4.2 - An expedition containing a Character with Defender cannot move forward
	 */
	public checkDefenderRestrictions(playerId: string): { hero: boolean; companion: boolean } {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return { hero: true, companion: true }; // Should not happen if playerId is valid

		const sharedExpeditionZone = this.gsm.state.sharedZones.expedition;
		let defenderInHeroExpedition = false;
		let defenderInCompanionExpedition = false;

		// Get all characters of the player in the shared expedition zone
		const allPlayerCharactersInExpedition = sharedExpeditionZone.getAll().filter(e => {
			if (!isGameObject(e)) return false;
			return e.controllerId === playerId && e.type === CardType.Character;
		}) as IGameObject[];

		for (const char of allPlayerCharactersInExpedition) {
			const hasDefender = char.currentCharacteristics.hasDefender === true ||
				(char.abilities && char.abilities.some((ability) => ability.keyword === KeywordAbility.Defender));

			if (hasDefender) {
				// Rule 7.4.4.a: A Gigantic Character is considered to be in both expeditions.
				// Rule 7.4.2.c: If a Gigantic Character has Defender, both expeditions are restricted.
				if (char.currentCharacteristics?.isGigantic) {
					console.log(`[KeywordAbilityHandler] Gigantic character ${char.name} with Defender restricts both expeditions for player ${playerId}.`);
					defenderInHeroExpedition = true;
					defenderInCompanionExpedition = true;
					break; // Both expeditions are restricted, no need to check further.
				}

				if (char.expeditionAssignment?.type === 'Hero') {
					console.log(`[KeywordAbilityHandler] Character ${char.name} with Defender restricts Hero expedition for player ${playerId}.`);
					defenderInHeroExpedition = true;
				} else if (char.expeditionAssignment?.type === 'Companion') {
					console.log(`[KeywordAbilityHandler] Character ${char.name} with Defender restricts Companion expedition for player ${playerId}.`);
					defenderInCompanionExpedition = true;
				}
			}
		}

		return {
			hero: !defenderInHeroExpedition,
			companion: !defenderInCompanionExpedition
		};
	}

	/**
	 * Processes Scout keyword when playing from hand
	 * Rule 7.4.5 - Can pay X as alternative cost and gains "Send me to Reserve" ability
	 * This method is now superseded by grantScoutSendToReserveAbility and will be removed.
	 */
	// public processScoutPlay(object: IGameObject, paidScoutCost: boolean): void { ... }


	/**
	 * Grants a temporary reaction ability to an object that was just played via Scout.
	 * The reaction sends the object to Reserve upon resolving its 'h' trigger (on play from hand).
	 * Rule 7.4.5.c
	 * @param scoutedObject The game object that was played using Scout.
	 */
	public grantScoutSendToReserveAbility(scoutedObject: IGameObject): void {
		if (!scoutedObject.currentCharacteristics) {
			console.warn(`[KeywordAbilityHandler] Object ${scoutedObject.name} (${scoutedObject.objectId}) has no currentCharacteristics to grant Scout reaction.`);
			// Initialize if missing, though it should ideally be there post-play by RuleAdjudicator or playCard logic
			scoutedObject.currentCharacteristics = {
				...scoutedObject.baseCharacteristics,
				grantedAbilities: [],
                negatedAbilityIds: [],
                statistics: scoutedObject.baseCharacteristics.statistics ? { ...scoutedObject.baseCharacteristics.statistics } : { forest: 0, mountain: 0, water: 0, power: 0, health: 0 },
                keywords: scoutedObject.baseCharacteristics.keywords ? { ...scoutedObject.baseCharacteristics.keywords } : {},
			};
		}
		if (!scoutedObject.currentCharacteristics.grantedAbilities) {
			scoutedObject.currentCharacteristics.grantedAbilities = [];
		}

		const sendToReserveAbilityId = `temp_scout_send_to_reserve_${scoutedObject.objectId}`;

		if (scoutedObject.currentCharacteristics.grantedAbilities.some(a => a.abilityId === sendToReserveAbilityId)) {
			console.log(`[KeywordAbilityHandler] Scout 'Send to Reserve' ability already granted to ${scoutedObject.name}.`);
			return;
		}

		const sendToReserveReaction: IAbility = {
			abilityId: sendToReserveAbilityId,
			abilityType: AbilityType.Reaction,
			isTemporary: true,
			text: "h Send me to Reserve (from Scout).",
			sourceObjectId: scoutedObject.objectId,
			isSupportAbility: false,
			trigger: {
				eventType: 'cardPlayed',
				condition: (payload: any, sourceObject: IGameObject, _gsm: GameStateManager): boolean => {
					if (!payload || !payload.card || !payload.card.objectId) return false;
					return payload.card.objectId === sourceObject.objectId &&
						   payload.fromZone === ZoneIdentifier.Hand &&
						   (payload.finalZone === ZoneIdentifier.Expedition || payload.finalZone === ZoneIdentifier.Landmark);
				}
			},
			effect: {
				steps: [
					{
						verb: 'PUT_IN_ZONE',
						targets: 'self',
						parameters: {
							destinationZoneIdentifier: ZoneIdentifier.Reserve,
						}
					}
				]
			}
		};

		scoutedObject.currentCharacteristics.grantedAbilities.push(sendToReserveReaction);
		console.log(`[KeywordAbilityHandler] Granted temporary 'Send to Reserve' reaction ability to ${scoutedObject.name} (${scoutedObject.objectId}) due to Scout play.`);
	}

	/**
	 * Checks if a character should not go to Reserve during Rest
	 * Rule 7.4.3 - Eternal characters are not sent to Reserve during Rest
	 */
	public isEternal(object: IGameObject): boolean {
		// First, check the characteristics applied by RuleAdjudicator
		if (object.currentCharacteristics.isEternal === true) {
			return true;
		}
		// Fallback: check the base abilities array if the characteristic isn't set
		// (e.g., if RuleAdjudicator hasn't run or missed it for some reason,
		// or for systems that might query this before full adjudication)
		return object.abilities.some(
			(ability) => ability.keyword === KeywordAbility.Eternal // Removed isKeyword check for broader compatibility
		);
	}

	/**
	 * Gets the Tough value (X) of an object.
	 * @param object The game object to check.
	 * @returns The Tough value, or 0 if the object does not have Tough.
	 */
	public getToughValue(object: IGameObject): number {
		let toughValue = 0;
		// Prioritize currentCharacteristics set by RuleAdjudicator
		if (object.currentCharacteristics && typeof (object.currentCharacteristics as any).isTough === 'number') {
			toughValue = (object.currentCharacteristics as any).isTough;
		} else if (object.currentCharacteristics && (object.currentCharacteristics as any).isTough === true) {
			// If isTough is just boolean true, assume Tough 1
			toughValue = 1;
		} else {
			// Fallback to base abilities if not found in currentCharacteristics
			const toughAbilityOnDef = object.abilities.find(
				(a) => a.keyword === KeywordAbility.Tough
			);
			if (toughAbilityOnDef && typeof toughAbilityOnDef.keywordValue === 'number') {
				toughValue = toughAbilityOnDef.keywordValue;
			} else if (toughAbilityOnDef) {
				// If keywordValue is not defined but ability exists, assume Tough 1
				toughValue = 1;
			}
		}
		return toughValue;
	}
}
