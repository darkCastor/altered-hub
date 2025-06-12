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

		// 1. Reset all objects to their base characteristics
		allObjects.forEach((obj) => {
			obj.currentCharacteristics = { ...obj.baseCharacteristics };
		});

		// 2. Gather all passive abilities
		// Ensure each ability has its sourceObjectId correctly set to the current object's ID
		// This is critical because obj.abilities might be derived from definitions or prior states.
		const allPassiveAbilities = allObjects.flatMap((obj) => {
			return obj.abilities
				.filter((a) => a.abilityType === 'passive')
				.map((a) => ({ ...a, sourceObjectId: obj.objectId }));
		});

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
		_allCurrentAbilities: IAbility[] // Prefixed with _
	): boolean {
		// Rule 2.3.2: A depends on B if B's application could change A's existence, text, or how it applies.
		if (!abilityA.sourceObjectId || !abilityB.sourceObjectId) return false;

		const sourceA = this.gsm.getObject(abilityA.sourceObjectId);
		if (!sourceA) return false;

		// Rule 2.3.2.d: B removes or negates A
		for (const stepB of abilityB.effect.steps) {
			const targetIdsOfB = this.gsm.effectProcessor.resolveTargetsForDependency(
				stepB.targets,
				abilityB.sourceObjectId,
				abilityB._triggerPayload
			);

			// Check if ability B has an effect step that `lose_ability` or `loseAbility`.
			if (stepB.verb === 'lose_ability' || stepB.verb === 'loseAbility') {
				// If the source object of ability A is among B's targets:
				if (targetIdsOfB.includes(sourceA.objectId)) {
					// Check if B's parameters specify losing the exact `abilityId` of A, or if `allAbilities` is true.
					if (
						stepB.parameters?.abilityId === abilityA.abilityId ||
						stepB.parameters?.allAbilities === true
					) {
						return true; // A depends on B because B removes A.
					}
				}
			}

			// Check if ability B has an effect step that `moveTo` or `move_to`.
			if (stepB.verb === 'moveTo' || stepB.verb === 'move_to') {
				// If the source object of ability A is among B's targets:
				if (targetIdsOfB.includes(sourceA.objectId)) {
					// Determine the destination zone.
					const destinationZone = this.gsm.effectProcessor.findZoneByTypeForDependency(
						sourceA.controllerId, // Assuming controller of sourceA is relevant for zone lookup
						stepB.parameters?.zone
					);

					// If the destination zone is a hidden zone or would cause the object to cease to exist.
					// For simplicity, we'll consider hidden zones.
					// Checking for "cease to exist" (e.g. token moving from expedition not to play) is more complex
					// and might require more information about object types (token vs. card) and zone properties.
					// Rule 4.2.1: Hidden zones are hand and deck.
					if (destinationZone) {
						if (destinationZone.type === 'hand' || destinationZone.type === 'deck') {
							return true; // A depends on B because B moves A's source to a hidden zone.
						}
						// Add more specific "cease to exist" conditions if possible, e.g. for tokens
						const objectA = this.gsm.getObject(abilityA.sourceObjectId);
						if (
							objectA?.isToken &&
							destinationZone.type !== 'expedition' &&
							destinationZone.type !== 'landmarkZone' // Assuming these are the only valid "play" zones for tokens
						) {
							// This is a simplified check. A more robust check might involve knowing if the destination
							// is explicitly "out of play" or "graveyard" and if the object is a token.
							// For now, if a token moves to a non-play zone (other than expedition/landmark), assume it ceases to exist for dependency.
							return true; // A depends on B because B moves A's token source to a zone where it might cease to exist.
						}
					}
				}
			}

			// Rule 2.3.2.e: B changes what A applies to
			if (abilityA.effect.targetCriteria) {
				const criteria = abilityA.effect.targetCriteria;
				// Check if ability B has an effect step like `set_characteristic`, `add_subtype`, or `remove_subtype`.
				if (
					stepB.verb === 'set_characteristic' ||
					stepB.verb === 'setCharacteristic' ||
					stepB.verb === 'add_subtype' ||
					stepB.verb === 'addSubtype' ||
					stepB.verb === 'remove_subtype' ||
					stepB.verb === 'removeSubtype'
				) {
					// If B's effect targets objects other than A's source:
					if (targetIdsOfB.some((id) => id !== sourceA.objectId)) {
						let characteristicChanged: string | undefined = undefined;
						let changedValue: any = undefined;
						let previousValue: any = undefined; // For remove_subtype or set_characteristic that overwrites

						if (stepB.verb === 'set_characteristic' || stepB.verb === 'setCharacteristic') {
							characteristicChanged = stepB.parameters?.characteristic;
							changedValue = stepB.parameters?.value;
							// To check if a relevant characteristic was changed *from* what A cares about,
							// we'd need to inspect the target object's state *before* B applies.
							// This is complex for dependency checking. We'll focus on B changing *to* what A cares about,
							// or changing a characteristic that A generally cares about.
						} else if (stepB.verb === 'add_subtype' || stepB.verb === 'addSubtype') {
							characteristicChanged = 'subType'; // Assuming subtype is the characteristic affected
							changedValue = stepB.parameters?.subType;
						} else if (stepB.verb === 'remove_subtype' || stepB.verb === 'removeSubtype') {
							characteristicChanged = 'subType'; // Assuming subtype is the characteristic affected
							previousValue = stepB.parameters?.subType; // B removes this subtype
						}

						// If B changes a characteristic (e.g., type, subType) that A's `targetCriteria` depends on
						if (characteristicChanged) {
							if (
								criteria.type &&
								characteristicChanged === 'type' &&
								(changedValue === criteria.type || previousValue === criteria.type)
							) {
								return true; // B changes type to/from what A targets
							}
							if (
								criteria.subType &&
								characteristicChanged === 'subType' &&
								(changedValue === criteria.subType || previousValue === criteria.subType)
							) {
								return true; // B changes subType to/from what A targets
							}
							// Add checks for other characteristics if `targetCriteria` can depend on them
							// e.g., power, health, specific keywords, if A targets based on those.
							// For now, type and subType are common.
						}
					}
				}
			}

			// Rule 2.3.2.f: B changes what A does
			// This requires understanding what characteristics ability A's conditions or effects depend on.
			// This is a heuristic-based approach. A more robust system would require abilities to declare their dependencies.

			if (stepB.verb === 'modify_statistics' || stepB.verb === 'set_characteristic') {
				// Check if B modifies characteristics of A's source object that A might depend on.
				if (targetIdsOfB.includes(sourceA.objectId)) {
					if (stepB.verb === 'modify_statistics') {
						// If B modifies power/health, and A potentially reads any power/health (heuristic).
						// A more precise check would involve parsing A's effect/condition text or structure.
						if (stepB.parameters?.power && abilityA.text.match(/\bpower\b/i)) {
							return true; // B modifies power, A's text mentions power
						}
						if (stepB.parameters?.health && abilityA.text.match(/\bhealth\b/i)) {
							return true; // B modifies health, A's text mentions health
						}
						// Add other stats if they become relevant and checkable
					} else if (stepB.verb === 'set_characteristic') {
						const charModifiedByB = stepB.parameters?.characteristic;
						if (charModifiedByB) {
							// Create a regex to check for the characteristic as a whole word.
							const characteristicRegex = new RegExp(`\\b${charModifiedByB}\\b`, 'i');
							if (abilityA.text.match(characteristicRegex)) {
								return true; // B sets a characteristic, A's text mentions it.
							}
						}
					}
				}

				// Check if B modifies characteristics of *other* objects that A's condition or effect might read.
				// This is even more complex as it requires knowing A's targeting and what it reads from those targets.
				// Example: A is "Creatures you control get +1/+1". B changes a creature's type. (This is partly covered by 2.3.2.e)
				// Example: A is "Draw cards equal to the number of Goblins you control". B makes something a Goblin.
				// For now, this part is difficult to implement generically without more structured ability definitions.
				// The existing 2.3.2.e covers some cases where B changes a target's characteristics that A's *targeting* depends on.
				// This part would be about characteristics A *reads* from objects it already knows it interacts with.
				// Consider a simplified check: if B modifies any object (not sourceA) and A's text contains common terms.
				if (targetIdsOfB.some((id) => id !== sourceA.objectId)) {
					if (stepB.verb === 'modify_statistics') {
						if (stepB.parameters?.power && abilityA.text.match(/\bpower\b/i)) {
							// B modifies power of another object, A might care about other objects' power
							// (e.g. "total power of creatures you control")
							return true;
						}
						if (stepB.parameters?.health && abilityA.text.match(/\bhealth\b/i)) {
							return true;
						}
					} else if (stepB.verb === 'set_characteristic') {
						const charModifiedByB = stepB.parameters?.characteristic;
						// If B changes a characteristic on another object that A's text mentions, assume potential dependency.
						// This is broad and might lead to false positives.
						if (charModifiedByB) {
							const characteristicRegex = new RegExp(`\\b${charModifiedByB}\\b`, 'i');
							if (abilityA.text.match(characteristicRegex)) {
								return true;
							}
						}
					}
				}
			}
		}
		return false;
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
		newAbilityDefinition: unknown /* IAbilityDefinition */
	): void {
		// This is complex: needs to instantiate an IAbility from IAbilityDefinition
		// and ensure it doesn't grant itself infinitely. For now, placeholder.
		// A proper implementation would add to a list of 'grantedAbilities' on currentCharacteristics.
		console.log(
			`[RuleAdjudicator] Placeholder: Granted ability defined by ${newAbilityDefinition.id} to ${target.name}`
		);
		// Example: if abilities are stored directly on currentCharacteristics (not typical for passive layers)
		// if (!target.currentCharacteristics.abilities) target.currentCharacteristics.abilities = [];
		// target.currentCharacteristics.abilities.push(this.gsm.objectFactory.createAbility(newAbilityDefinition, target.objectId));
	}

	private _loseAbility(target: IGameObject, abilityIdToLose: string): void {
		// Similar to grant, this is complex. Placeholder.
		// Would modify currentCharacteristics to mark an ability as lost/negated.
		console.log(
			`[RuleAdjudicator] Placeholder: Lost ability ${abilityIdToLose} from ${target.name}`
		);
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
						if (step.parameters?.ability) {
							this._grantAbility(target, step.parameters.ability);
						}
						break;
					case 'lose_ability':
					case 'loseability':
						if (step.parameters?.abilityId) {
							this._loseAbility(target, step.parameters.abilityId);
						}
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
		// Iterate over the values (IPlayer objects) of the Map
		for (const player of this.gsm.state.players.values()) {
			// Corrected to lowercase 'expedition' and 'landmark'
			if (player.zones.expedition) {
				objects.push(...player.zones.expedition.getAll());
			}
			if (player.zones.landmarkZone) {
				objects.push(...player.zones.landmarkZone.getAll());
			}
		}
		return objects;
	}
}
