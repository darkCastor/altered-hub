// src/engine/RuleAdjudicator.ts (New File)

import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IAbility } from './types/abilities';
import { KeywordAbility } from './types/enums'; // Import KeywordAbility

export class RuleAdjudicator {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Re-evaluates and applies all passive abilities in the game.
	 * This should be called after any event modifies the game state.
	 * Implements Rule 2.3.
	 */
	public applyAllPassiveAbilities(): void {
		const allObjects = this.getAllPlayObjects();

		// 1. Reset all objects to their base characteristics, including new fields
		allObjects.forEach((obj) => {
			obj.currentCharacteristics = {
				...obj.baseCharacteristics,
				grantedAbilities: [], // Initialize as empty array
				negatedAbilityIds: [], // Initialize as empty array
			};
		});

		// 2. Gather all passive abilities from base abilities and granted abilities
		// Filter out negated abilities at this stage.
		const allPassiveAbilities: IAbility[] = [];
		for (const obj of allObjects) {
			const baseAbilities = obj.abilities
				.map((a) => ({ ...a, sourceObjectId: obj.objectId })) // Ensure sourceObjectId
				.filter((a) => a.abilityType === 'passive');

			const grantedAbilities = (obj.currentCharacteristics.grantedAbilities || [])
				.map((a) => ({ ...a, sourceObjectId: obj.objectId })) // Ensure sourceObjectId, though grantAbility should do this
				.filter((a) => a.abilityType === 'passive');

			const currentObjectAbilities = [...baseAbilities, ...grantedAbilities];

			for (const ability of currentObjectAbilities) {
				// If an ability is negated on its source object, it should not be collected.
				if (
					!obj.currentCharacteristics.negatedAbilityIds?.includes(ability.abilityId)
				) {
					allPassiveAbilities.push(ability);
				}
			}
		}

		// 3. Sort abilities based on dependency and then timestamp (Rule 2.3.3)
		//    This is a complex step. You'll need to build a dependency graph.
		const sortedAbilities = this.sortAbilitiesByDependency(allPassiveAbilities);

		// 4. Apply abilities in the sorted order
		for (const ability of sortedAbilities) {
			this.applyAbility(ability);
		}

		console.log('[RuleAdjudicator] Re-applied all passive abilities.');
	}

	private doesADependOnB(
		abilityA: IAbility,
		abilityB: IAbility,
		_allCurrentAbilities: IAbility[] // Prefixed with _ // TODO: use this for LKI if needed
	): boolean {
		// Rule 2.3.2: A depends on B if B's application could change A's existence, text, or how it applies.
		if (!abilityA.sourceObjectId || !abilityB.sourceObjectId) return false;

		const sourceA = this.gsm.getObject(abilityA.sourceObjectId);
		if (!sourceA) return false;
		// Note: sourceB is not fetched here as we iterate B's effects, not B's properties directly for most checks.

		for (const stepB of abilityB.effect.steps) {
			const targetIdsOfB = this.gsm.effectProcessor.resolveTargetsForDependency(
				stepB.targets,
				abilityB.sourceObjectId, // source of ability B
				abilityB._triggerPayload // payload for ability B
			);

			// Rule 2.3.2.d (Existence): B removes A's existence or negates A's ability.
			// 2.3.2.d.i: B moves A's source object to a zone where it would cease to exist.
			if (stepB.verb === 'moveTo' || stepB.verb === 'move_to') {
				if (targetIdsOfB.includes(sourceA.objectId)) {
					const destinationZoneType = stepB.parameters?.zone as string; // e.g., 'hand', 'deck', 'discard', 'removedFromGame'
					const objectAIsToken = sourceA.baseCharacteristics.isToken === true || (sourceA.currentCharacteristics as any).isToken === true;

					if (objectAIsToken) {
						// Tokens cease to exist if moved to hand, deck, discard, or explicitly 'removedFromGame'
						// They typically only exist in 'expedition', 'landmarkZone', or similar 'in-play' zones.
						if (
							destinationZoneType === 'hand' ||
							destinationZoneType === 'deck' ||
							destinationZoneType === 'discard' ||
							destinationZoneType === 'removedFromGame' // Hypothetical
						) {
							return true; // A depends on B because B moves A's token source to a zone of non-existence.
						}
					}
					// For non-tokens, moving to hand/deck (hidden zones) makes them lose abilities for now.
					// Rule 4.2.1: Hidden zones are hand and deck.
					if (destinationZoneType === 'hand' || destinationZoneType === 'deck') {
						return true; // A depends on B because B moves A's source to a hidden zone.
					}
				}
			}

			// 2.3.2.d.ii: B's effect explicitly negates or removes A's specific ability.
			if (stepB.verb === 'lose_ability' || stepB.verb === 'loseAbility') {
				if (targetIdsOfB.includes(sourceA.objectId)) {
					if (
						stepB.parameters?.abilityId === abilityA.abilityId ||
						stepB.parameters?.allAbilities === true
					) {
						return true; // A depends on B because B negates A.
					}
				}
			}

			// Rule 2.3.2.e (Applicability): B changes a characteristic that A's targeting or conditions depend on.
			// This applies if B targets *any* object, and A's criteria might now match or unmatch.
			if (abilityA.effect.targetCriteria) { // Assuming targetCriteria holds conditions for A's targets
				const criteria = abilityA.effect.targetCriteria as any; // Cast to any for dynamic property access

				for (const targetIdOfB of targetIdsOfB) {
					// It doesn't matter if targetIdOfB is sourceA or another object.
					// We are checking if B's effect on targetIdOfB could change whether A applies to *something*.

					if (stepB.verb === 'set_characteristic' || stepB.verb === 'setCharacteristic') {
						const char = stepB.parameters?.characteristic as string;
						const val = stepB.parameters?.value;
						if (criteria.type && char === 'type' && (val === criteria.type /* becomes relevant */ || this.gsm.getObject(targetIdOfB)?.currentCharacteristics.type === criteria.type /* was relevant */)) return true;
						if (criteria.subType && char === 'subType' && (val === criteria.subType || this.gsm.getObject(targetIdOfB)?.currentCharacteristics.subTypes?.includes(criteria.subType))) return true;
						if (criteria.controller && char === 'controllerId' && (val === criteria.controller || this.gsm.getObject(targetIdOfB)?.controllerId === criteria.controller )) return true;
						// Add other characteristics like power, health if criteria can use them.
					}
					if (stepB.verb === 'add_subtype' || stepB.verb === 'addSubtype') {
						const subTypeAdded = stepB.parameters?.subType as string;
						if (criteria.subType && subTypeAdded === criteria.subType) return true; // B adds a subtype A cares about
					}
					if (stepB.verb === 'remove_subtype' || stepB.verb === 'removeSubtype') {
						const subTypeRemoved = stepB.parameters?.subType as string;
						if (criteria.subType && subTypeRemoved === criteria.subType) return true; // B removes a subtype A cares about
					}
					if (stepB.verb === 'grant_keyword' || stepB.verb === 'grantKeyword') {
						const keywordGranted = stepB.parameters?.keyword as string;
						if (criteria.keyword && keywordGranted === criteria.keyword) return true; // B grants a keyword A cares about
						if (criteria.keywords && criteria.keywords.includes(keywordGranted)) return true;
					}
					if (stepB.verb === 'lose_keyword' || stepB.verb === 'loseKeyword') {
						const keywordLost = stepB.parameters?.keyword as string;
						if (criteria.keyword && keywordLost === criteria.keyword) return true; // B removes a keyword A cares about
						if (criteria.keywords && criteria.keywords.includes(keywordLost)) return true;
					}
					if ((stepB.verb === 'moveTo' || stepB.verb === 'move_to') && criteria.zone) {
						// If A targets objects in a specific zone, and B moves objects to/from that zone.
						const targetZone = stepB.parameters?.zone as string;
						const originalZone = this.gsm.getObject(targetIdOfB)?.currentCharacteristics.zone; // Requires zone on characteristics
						if (targetZone === criteria.zone || originalZone === criteria.zone) return true;
					}
					if ((stepB.verb === 'change_controller' || stepB.verb === 'changeController') && criteria.controllerId) {
						// If A targets based on controller, and B changes controller
						// criteria.controllerId could be 'self', 'opponent', or a player ID.
						// This is complex, a simple check: if controller changes, A might depend on it.
						return true;
					}
				}
			}
			// Also consider if A has conditional clauses not tied to targets, e.g. "If you control a Goblin, X happens"
			// This would require abilityA.effect.condition to be structured and checked.

			// Rule 2.3.2.f (What A Does): B changes a characteristic that A's *effect* relies on.
			// This is about the *magnitude* or *nature* of A's effect changing.
			// Heuristic: Check if B modifies a characteristic that A's text mentions.
			const characteristicModifiedByBInStep = this.getCharacteristicModifiedByStepB(stepB);

			if (characteristicModifiedByBInStep) {
				// 2.3.2.f.i: B changes a characteristic of A's source object that A's effect relies on.
				if (targetIdsOfB.includes(sourceA.objectId)) {
					const characteristicRegex = new RegExp(`\\b${characteristicModifiedByBInStep}\\b`, 'i');
					if (abilityA.text.match(characteristicRegex)) {
						// Example: A says "Draw cards equal to my power", B changes sourceA's power.
						return true;
					}
				}

				// 2.3.2.f.ii: B changes a characteristic of *another* object that A's effect reads or uses.
				// This requires A to somehow reference other objects in its effect text.
				// Example: A is "Deal damage equal to the power of target creature". B changes that target's power.
				// This is hard without structured effect descriptions for A.
				// Heuristic: If B changes a characteristic on *any* object, and A's text mentions that characteristic,
				// and A's effect *could* plausibly read that characteristic from an object it affects or queries.
				// This is a broad heuristic and might cause over-dependency.
				if (targetIdsOfB.some((id) => id !== sourceA.objectId)) {
					const characteristicRegex = new RegExp(`\\b${characteristicModifiedByBInStep}\\b`, 'i');
					if (abilityA.text.match(characteristicRegex)) {
						// Example: A is "All Goblins get +1/+1 for each artifact you control".
						// B changes an artifact's characteristic (e.g. makes it not an artifact, or changes a count).
						// This is very simplified.
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * Helper to identify what characteristic a step of B might modify.
	 * Used for Rule 2.3.2.f heuristics.
	 */
	private getCharacteristicModifiedByStepB(stepB: IEffectStep): string | null {
		if (stepB.verb === 'modify_statistics' || stepB.verb === 'modifyStatistics') {
			if (stepB.parameters?.power) return 'power';
			if (stepB.parameters?.health) return 'health';
			// Add other stats if they are distinct characteristics mentioned in text
		} else if (stepB.verb === 'set_characteristic' || stepB.verb === 'setCharacteristic') {
			return stepB.parameters?.characteristic as string;
		} else if (stepB.verb === 'add_subtype' || stepB.verb === 'addSubtype' || stepB.verb === 'remove_subtype' || stepB.verb === 'removeSubtype') {
			return 'subType'; // Or 'subTypes'
		} else if (stepB.verb === 'grant_keyword' || stepB.verb === 'grantKeyword' || stepB.verb === 'lose_keyword' || stepB.verb === 'loseKeyword') {
			return stepB.parameters?.keyword as string; // e.g. "Eternal", "Defender"
		}
		// Other verbs like 'change_controller', 'set_zone' could also be here.
		return null;
	}


	private sortAbilitiesByDependency(abilities: IAbility[]): IAbility[] {
		let unappliedAbilities = [...abilities];
		const sortedAbilities: IAbility[] = [];
		const appliedTimestamps = new Set<number>(); // To handle Rule 2.3.3.d for ties

		while (unappliedAbilities.length > 0) {
			let freeAbilities: IAbility[] = [];

			for (const abilityA of unappliedAbilities) {
				let isFree = true;
				for (const abilityB of unappliedAbilities) {
					if (abilityA === abilityB) continue;

					if (this.doesADependOnB(abilityA, abilityB, unappliedAbilities)) {
						// A depends on B. Is B dependent on A as well (circular)?
						if (!this.doesADependOnB(abilityB, abilityA, unappliedAbilities)) {
							isFree = false; // A depends on B, but B does not depend on A
							break;
						}
						// If B also depends on A, it's a circular dependency,
						// and they are considered "free" relative to each other for timestamp sorting.
					}
				}
				if (isFree) {
					freeAbilities.push(abilityA);
				}
			}

			if (freeAbilities.length === 0 && unappliedAbilities.length > 0) {
				// This should ideally not happen if dependency logic is correct,
				// but as a fallback, or if there's an unresolvable circular dependency
				// not handled by timestamp, we might break or add error handling.
				// For now, let's just add the remaining by timestamp to avoid infinite loops.
				console.warn(
					'[RuleAdjudicator] No free abilities found, but unapplied abilities remain. Sorting rest by timestamp.',
					unappliedAbilities
				);
				freeAbilities = [...unappliedAbilities];
			}

			// From the "free" abilities, select the one whose source object has the smallest timestamp. (Rule 2.3.3.c)
			// Handle ties using Rule 2.3.3.d (already applied abilities' timestamps) - this is complex.
			// For now, a simple timestamp sort.
			freeAbilities.sort((a, b) => {
				const objA = this.gsm.getObject(a.sourceObjectId || ''); // sourceObjectId should be guaranteed by this stage
				const objB = this.gsm.getObject(b.sourceObjectId || ''); // sourceObjectId should be guaranteed by this stage
				if (!objA || !objB) {
					// This case should ideally not be reached if sourceObjectIds are always valid.
					// If it occurs, treat their timestamps as equal for sorting stability regarding these items.
					console.warn('[RuleAdjudicator] Could not find source object for one or more abilities during sorting:', a.abilityId, b.abilityId);
					return 0;
				}
				if (objA.timestamp === objB.timestamp) {
					// Rule 2.3.3.c specifies timestamp as the primary sort key.
					// Rule 2.3.3.d (old version, for complex tie-breaking) would involve checking
					// if one source object's other abilities have already been applied.
					// That level of tie-breaking is not implemented here.
					// Returning 0 preserves the original relative order of elements with equal timestamps (stable sort behavior).
					return 0;
				}
				return objA.timestamp - objB.timestamp; // Sort by smallest timestamp first.
			});

			if (freeAbilities.length > 0) {
				const nextAbility = freeAbilities[0];
				sortedAbilities.push(nextAbility);
				unappliedAbilities = unappliedAbilities.filter((a) => a !== nextAbility);
				const sourceObject = this.gsm.getObject(nextAbility.sourceObjectId || ''); // sourceObjectId should be valid
				if (sourceObject) {
					appliedTimestamps.add(sourceObject.timestamp); // Track timestamp of applied ability's source
				}
			} else if (unappliedAbilities.length > 0) {
				// This block handles cases where no abilities are "free" according to doesADependOnB,
				// potentially due to complex circular dependencies not resolved by the isFree logic,
				// or an issue in dependency detection.
				// As a fallback to prevent infinite loops, sort the remaining abilities by timestamp.
				console.warn(
					'[RuleAdjudicator] Fallback: No strictly free abilities found, sorting remaining by timestamp.',
					unappliedAbilities.map(a => a.abilityId)
				);
				unappliedAbilities.sort((a, b) => {
					const objA = this.gsm.getObject(a.sourceObjectId || '');
					const objB = this.gsm.getObject(b.sourceObjectId || '');
					if (!objA || !objB) {
						console.warn('[RuleAdjudicator] Fallback sort: Could not find source object for one or more abilities:', a.abilityId, b.abilityId);
						return 0;
					}
					// Primary sort by timestamp for the fallback scenario as well.
					// Tie-breaking here also defaults to stable sort behavior.
					return objA.timestamp === objB.timestamp ? 0 : objA.timestamp - objB.timestamp;
				});
				const fallbackAbility = unappliedAbilities.shift();
				if (fallbackAbility) {
					sortedAbilities.push(fallbackAbility);
					const sourceObject = this.gsm.getObject(fallbackAbility.sourceObjectId || '');
					if (sourceObject) {
						appliedTimestamps.add(sourceObject.timestamp);
					}
				}
			}
		}
		return sortedAbilities;
	}

	// --- Helper methods for applying ability effects ---
	private _modifyStatistics(
		target: IGameObject,
		params: Record<string, unknown> | undefined
	): void {
		if (!params) return;
		if (!target.currentCharacteristics.statistics) {
			target.currentCharacteristics.statistics = {
				forest: 0,
				mountain: 0,
				water: 0,
				power: 0,
				health: 0
			};
		}
		const stats = target.currentCharacteristics.statistics;
		if (params.forest !== undefined) stats.forest = (stats.forest || 0) + params.forest;
		if (params.mountain !== undefined) stats.mountain = (stats.mountain || 0) + params.mountain;
		if (params.water !== undefined) stats.water = (stats.water || 0) + params.water;
		if (params.power !== undefined) stats.power = (stats.power || 0) + params.power;
		if (params.health !== undefined) stats.health = (stats.health || 0) + params.health;
		console.log(
			`[RuleAdjudicator] Modified stats for ${target.name}: P:${params.power}, H:${params.health}`
		);
	}

	private _grantKeyword(target: IGameObject, keyword: string, value?: unknown): void {
		// Set specific keyword properties based on the rulebook
		switch (keyword.toLowerCase()) {
			case 'eternal':
				(target.currentCharacteristics as any).isEternal = true;
				break;
			case 'defender':
				(target.currentCharacteristics as any).hasDefender = true;
				break;
			case 'gigantic':
				(target.currentCharacteristics as any).isGigantic = true;
				break;
			case 'seasoned':
				(target.currentCharacteristics as any).isSeasoned = true;
				break;
			case 'tough':
				(target.currentCharacteristics as any).isTough = value !== undefined ? value : 1;
				break;
			case 'scout':
				(target.currentCharacteristics as any).scoutValue = value !== undefined ? value : 1;
				break;
			case 'fleeting':
				(target.currentCharacteristics as any).isFleeting = true;
				break;
			default:
				// For unknown keywords, store in keywords object as fallback
				if (!target.currentCharacteristics.keywords) target.currentCharacteristics.keywords = {};
				target.currentCharacteristics.keywords[keyword] = value !== undefined ? value : true;
				break;
		}
		console.log(`[RuleAdjudicator] Granted keyword ${keyword} to ${target.name}`);
	}

	private _loseKeyword(target: IGameObject, keyword: string): void {
		// Remove specific keyword properties based on the rulebook
		switch (keyword.toLowerCase()) {
			case 'eternal':
				(target.currentCharacteristics as any).isEternal = false;
				break;
			case 'defender':
				(target.currentCharacteristics as any).hasDefender = false;
				break;
			case 'gigantic':
				(target.currentCharacteristics as any).isGigantic = false;
				break;
			case 'seasoned':
				(target.currentCharacteristics as any).isSeasoned = false;
				break;
			case 'tough':
				delete (target.currentCharacteristics as any).isTough;
				break;
			case 'scout':
				delete (target.currentCharacteristics as any).scoutValue;
				break;
			case 'fleeting':
				(target.currentCharacteristics as any).isFleeting = false;
				break;
			default:
				// For unknown keywords, remove from keywords object
				if (target.currentCharacteristics.keywords) {
					delete target.currentCharacteristics.keywords[keyword];
				}
				break;
		}
		console.log(`[RuleAdjudicator] Lost keyword ${keyword} from ${target.name}`);
	}

	private _setCharacteristic(target: IGameObject, characteristic: string, value: unknown): void {
		(target.currentCharacteristics as Record<string, unknown>)[characteristic] = value;
		console.log(
			`[RuleAdjudicator] Set characteristic ${characteristic}=${value} for ${target.name}`
		);
	}

	private _grantAbility(
		target: IGameObject,
		newAbilityDefinition: any, // Assuming IAbilityDefinition structure
		sourceOfGrantEffectId: string // The object ID of the ability granting this one
	): void {
		if (!this.gsm.objectFactory || typeof this.gsm.objectFactory.createAbility !== 'function') {
			console.error('[RuleAdjudicator] ObjectFactory or createAbility method not available on GSM.');
			return;
		}
		// The new ability's source is the object it's granted TO (target).
		// The effect causing the grant comes from sourceOfGrantEffectId.
		const newAbility = this.gsm.objectFactory.createAbility(newAbilityDefinition, target.objectId);
		if (newAbility) {
			if (!target.currentCharacteristics.grantedAbilities) {
				target.currentCharacteristics.grantedAbilities = [];
			}
			// Ensure the newly granted ability also has its sourceObjectId correctly set
			newAbility.sourceObjectId = target.objectId;
			target.currentCharacteristics.grantedAbilities.push(newAbility);
			console.log(
				`[RuleAdjudicator] Granted ability ${newAbility.abilityId} (defined by ${newAbilityDefinition.id || 'unknown definition'}) to ${target.name} (${target.objectId}). Source of grant effect: ${sourceOfGrantEffectId}`
			);
		} else {
			console.error(
				`[RuleAdjudicator] Failed to create ability from definition for ${target.name}`, newAbilityDefinition
			);
		}
	}

	private _loseAbility(target: IGameObject, params: Record<string, unknown> | undefined): void {
		if (!params) return;
		const abilityIdToLose = params.abilityId as string;
		const allAbilitiesFlag = params.allAbilities as boolean;

		if (!target.currentCharacteristics.negatedAbilityIds) {
			target.currentCharacteristics.negatedAbilityIds = [];
		}

		if (allAbilitiesFlag) {
			// Negate all base abilities
			target.abilities.forEach(a => {
				if (!target.currentCharacteristics.negatedAbilityIds?.includes(a.abilityId)) {
					target.currentCharacteristics.negatedAbilityIds?.push(a.abilityId);
				}
			});
			// Clear previously granted abilities and mark them as negated (in case they are re-granted)
			if (target.currentCharacteristics.grantedAbilities) {
				target.currentCharacteristics.grantedAbilities.forEach(a => {
					if (!target.currentCharacteristics.negatedAbilityIds?.includes(a.abilityId)) {
						target.currentCharacteristics.negatedAbilityIds?.push(a.abilityId);
					}
				});
				target.currentCharacteristics.grantedAbilities = []; // Clear them
			}
			console.log(`[RuleAdjudicator] Lost ALL abilities from ${target.name}`);
		} else if (abilityIdToLose) {
			if (!target.currentCharacteristics.negatedAbilityIds.includes(abilityIdToLose)) {
				target.currentCharacteristics.negatedAbilityIds.push(abilityIdToLose);
			}
			// If the ability to lose was a granted one, also remove it from grantedAbilities
			if (target.currentCharacteristics.grantedAbilities) {
				target.currentCharacteristics.grantedAbilities = target.currentCharacteristics.grantedAbilities.filter(
					(a) => a.abilityId !== abilityIdToLose
				);
			}
			console.log(`[RuleAdjudicator] Lost ability ${abilityIdToLose} from ${target.name}`);
		}
	}


	private applyAbility(ability: IAbility): void {
		if (!ability.sourceObjectId) return;
		const sourceObject = this.gsm.getObject(ability.sourceObjectId);
		if (!sourceObject) {
			console.warn(
				`[RuleAdjudicator] Source object ${ability.sourceObjectId} not found for ability ${ability.abilityId}`
			);
			return;
		}

		if (!sourceObject.currentCharacteristics) {
			sourceObject.currentCharacteristics = { ...sourceObject.baseCharacteristics };
		}

		console.log(
			`[RuleAdjudicator] Applying passive ability ${ability.abilityId} from ${sourceObject.name} (${sourceObject.objectId})`
		);

		// Handle keyword abilities directly if they have a keyword property
		if (ability.keyword && Object.values(KeywordAbility).includes(ability.keyword)) {
			this._grantKeyword(sourceObject, ability.keyword, ability.value);
		}

		// Process effect steps if they exist
		for (const step of ability.effect.steps) {
			// Determine targets for this step. For many passives, target is 'self' (the sourceObject).
			// This part needs to be flexible if passives can target others.
			// For now, let's assume most passive steps implicitly target the sourceObject unless specified otherwise.
			let targetsOfStep: IGameObject[] = [sourceObject];
			if (step.targets) {
				// A simple 'self' check, could be expanded
				if (step.targets === 'self') {
					targetsOfStep = [sourceObject];
				} else {
					// TODO: Implement more complex target resolution for passive effects if needed.
					// For now, if not 'self', it's unclear who the target is for a passive step.
					// Most passives modify their source.
					console.warn(
						`[RuleAdjudicator] Passive ability step has non-'self' target: ${step.targets}. Assuming 'self' for now.`
					);
					targetsOfStep = [sourceObject];
				}
			}

			for (const target of targetsOfStep) {
				if (!target.currentCharacteristics) {
					// Ensure target also has currentCharacteristics
					target.currentCharacteristics = { ...target.baseCharacteristics };
				}
				switch (step.verb.toLowerCase()) {
					case 'modify_statistics':
					case 'modifystatistics':
						this._modifyStatistics(target, step.parameters);
						break;
					case 'grant_keyword':
					case 'grantkeyword':
						if (step.parameters?.keyword) {
							this._grantKeyword(target, step.parameters.keyword, step.parameters.value);
						}
						break;
					case 'lose_keyword':
					case 'losekeyword':
						if (step.parameters?.keyword) {
							this._loseKeyword(target, step.parameters.keyword);
						}
						break;
					case 'set_characteristic':
					case 'setcharacteristic':
						if (step.parameters?.characteristic && step.parameters.value !== undefined) {
							this._setCharacteristic(
								target,
								step.parameters.characteristic,
								step.parameters.value
							);
						}
						break;
					case 'grant_ability': // Assuming IAbilityDefinition is passed in parameters.ability
					case 'grantability':
						if (step.parameters?.ability && ability.sourceObjectId) { // ability.sourceObjectId is source of current effect
							this._grantAbility(target, step.parameters.ability, ability.sourceObjectId);
						}
						break;
					case 'lose_ability':
					case 'loseability':
						// Pass all parameters to _loseAbility, it will extract abilityId or allAbilities
						this._loseAbility(target, step.parameters);
						break;
					// Legacy keyword handling from original applyAbility (can be refactored to use steps)
					case 'apply_keyword_gigantic':
						this._grantKeyword(target, 'Gigantic');
						break;
					case 'apply_keyword_defender':
						this._grantKeyword(target, 'Defender');
						break;
					case 'apply_keyword_eternal':
						this._grantKeyword(target, 'Eternal');
						break;
					default:
						// Check if verb matches a known keyword directly for very simple passives
						if (Object.values(KeywordAbility).includes(step.verb as KeywordAbility)) {
							this._grantKeyword(target, step.verb);
						} else {
							console.log(
								`[RuleAdjudicator] Passive ability ${ability.abilityId} step verb '${step.verb}' has no specific application logic yet.`
							);
						}
						break;
				}
			}
		}
	}

	private getAllPlayObjects(): IGameObject[] {
		const objects: IGameObject[] = [];
		// From shared expedition zone
		if (this.gsm.state.sharedZones?.expedition) {
			objects.push(...this.gsm.state.sharedZones.expedition.getAll());
		}
		// From player-specific landmark zones
		for (const player of this.gsm.state.players.values()) {
			if (player.zones.landmarkZone) {
				objects.push(...player.zones.landmarkZone.getAll());
			}
		}
		// Potentially add other zones like "global" or "neutral" if they can contain objects with passive abilities
		return objects;
	}
}
