// src/engine/RuleAdjudicator.ts (New File)

import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IAbility } from './types/abilities';

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
		allCurrentAbilities: IAbility[]
	): boolean {
		// Rule 2.3.2: A depends on B if B's application could change A's existence, text, or how it applies.
		if (!abilityA.sourceObjectId || !abilityB.sourceObjectId) return false;

		const sourceA = this.gsm.getObject(abilityA.sourceObjectId);
		// const sourceB = this.gsm.getObject(abilityB.sourceObjectId); // Not always needed directly
		if (!sourceA) return false;

		for (const stepB of abilityB.effect.steps) {
			const targetIdsOfB = this.gsm.effectProcessor.resolveTargetsForDependency(
				stepB.targets,
				abilityB.sourceObjectId,
				abilityB._triggerPayload
			);

			// 2.3.2.d: B removes or negates A
			if (stepB.verb === 'lose_ability' || stepB.verb === 'loseAbility') {
				if (targetIdsOfB.includes(sourceA.objectId)) {
					if (
						stepB.parameters?.abilityId === abilityA.abilityId ||
						stepB.parameters?.allAbilities === true
					) {
						return true; // B removes A
					}
				}
			}
			if (stepB.verb === 'moveTo' || stepB.verb === 'move_to') {
				// B causes A's source to leave play
				if (targetIdsOfB.includes(sourceA.objectId)) {
					const destZone = this.gsm.effectProcessor.findZoneByTypeForDependency(
						sourceA.controllerId,
						stepB.parameters?.zone
					);
					if (destZone && destZone.visibility === 'hidden') return true; // B moves source of A out of play
				}
			}

			// 2.3.2.e: B changes what A applies to (characteristics like type/subtype, or zone)
			// This is complex. Simple case: B changes type, A targets that type.
			if (abilityA.effect.targetCriteria?.type && stepB.verb === 'set_characteristic') {
				// e.g. A targets 'Goblin'
				if (targetIdsOfB.some((id) => id !== sourceA.objectId)) {
					// B affects objects other than A's source
					if (
						stepB.parameters?.characteristic === 'type' &&
						stepB.parameters?.value === abilityA.effect.targetCriteria.type
					) {
						// If B changes an object to become type X, and A targets type X.
						// Or if B changes an object from type X to something else.
						return true;
					}
				}
			}

			// 2.3.2.f: B changes what A does (modifies characteristics A's condition/effect relies on)
			if (targetIdsOfB.includes(sourceA.objectId)) {
				// B affects source of A
				if (stepB.verb === 'modify_statistics' || stepB.verb === 'set_characteristic') {
					// Example: A's condition: "if power >= 5". B modifies power.
					// Example: A's effect: "draw X cards where X is power". B modifies power.
					// This requires knowing what characteristics A *reads*. For now, assume any stat/char change is a potential dependency.
					if (
						stepB.parameters?.power ||
						stepB.parameters?.health ||
						(stepB.parameters?.characteristic &&
							abilityA.text.includes(stepB.parameters.characteristic))
					) {
						return true;
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
				const objA = this.gsm.getObject(a.sourceObjectId!);
				const objB = this.gsm.getObject(b.sourceObjectId!);
				if (!objA || !objB) return 0; // Should not happen if data is consistent
				if (objA.timestamp === objB.timestamp) {
					// Rule 2.3.3.d - if timestamps are equal, check if one source object's abilities
					// have already been applied. This part is tricky and might need more state.
					// For now, a simple secondary sort or arbitrary pick is fine.
					// A truly compliant solution would need to track which object's abilities
					// (even if different specific abilities) were chosen in previous steps.
					// This simplified version might not fully comply with 2.3.3.d for tie-breaking.
					return 0; // Keep original order for now on ties, or implement a more robust tie-breaker
				}
				return objA.timestamp - objB.timestamp;
			});

			if (freeAbilities.length > 0) {
				const nextAbility = freeAbilities[0];
				sortedAbilities.push(nextAbility);
				unappliedAbilities = unappliedAbilities.filter((a) => a !== nextAbility);
				const sourceObject = this.gsm.getObject(nextAbility.sourceObjectId!);
				if (sourceObject) {
					appliedTimestamps.add(sourceObject.timestamp);
				}
			} else if (unappliedAbilities.length > 0) {
				// If no ability was selected (e.g. freeAbilities was empty or became empty after filtering)
				// and there are still unapplied abilities, this indicates a potential issue
				// or a state where the current simplified dependency logic cannot proceed.
				// Fallback: Add the one with the smallest timestamp from remaining unapplied to prevent infinite loop.
				unappliedAbilities.sort((a, b) => {
					const objA = this.gsm.getObject(a.sourceObjectId!);
					const objB = this.gsm.getObject(b.sourceObjectId!);
					if (!objA || !objB) return 0;
					return objA.timestamp - objB.timestamp;
				});
				const fallbackAbility = unappliedAbilities.shift();
				if (fallbackAbility) {
					sortedAbilities.push(fallbackAbility);
					const sourceObject = this.gsm.getObject(fallbackAbility.sourceObjectId!);
					if (sourceObject) {
						appliedTimestamps.add(sourceObject.timestamp);
					}
				}
			}
		}
		return sortedAbilities;
	}

	// --- Helper methods for applying ability effects ---
	private _modifyStatistics(target: IGameObject, params: any): void {
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

	private _grantKeyword(target: IGameObject, keyword: string, value?: any): void {
		// Assuming keyword is string for now
		if (!target.currentCharacteristics.keywords) target.currentCharacteristics.keywords = {};
		target.currentCharacteristics.keywords[keyword] = value !== undefined ? value : true;
		console.log(`[RuleAdjudicator] Granted keyword ${keyword} to ${target.name}`);
	}

	private _loseKeyword(target: IGameObject, keyword: string): void {
		if (target.currentCharacteristics.keywords) {
			delete target.currentCharacteristics.keywords[keyword];
			console.log(`[RuleAdjudicator] Lost keyword ${keyword} from ${target.name}`);
		}
	}

	private _setCharacteristic(target: IGameObject, characteristic: string, value: any): void {
		(target.currentCharacteristics as any)[characteristic] = value;
		console.log(
			`[RuleAdjudicator] Set characteristic ${characteristic}=${value} for ${target.name}`
		);
	}

	private _grantAbility(
		target: IGameObject,
		newAbilityDefinition: any /* IAbilityDefinition */
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
