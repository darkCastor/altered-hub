// src/engine/RuleAdjudicator.ts

import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance } from './types/objects';
import type { IAbility, ModifyPlayCostParameters, IEffectStep } from './types/abilities';
import { KeywordAbility, ZoneIdentifier, CardType, AbilityType } from './types/enums';
import type { CostModifier } from './types/costs';

export class RuleAdjudicator {
	constructor(private gsm: GameStateManager) {}

	public getActiveCostModifiersForCardPlay(
		cardBeingPlayed: IGameObject | ICardInstance,
		playingPlayerId: string,
		fromZone: ZoneIdentifier,
		// gsm is available via this.gsm
	): CostModifier[] {
		const activeModifiers: CostModifier[] = [];
		const allPlayObjects = this.getAllPlayObjects(); // Includes objects in expedition and landmark zones

		// Consider global emblems or other sources of modifiers if they exist in your game
		// For now, focusing on abilities on objects in play

		for (const modifierSource of allPlayObjects) {
			if (!modifierSource.currentCharacteristics) continue; // Object might not have had passives applied yet or is base

			const abilitiesToCheck: IAbility[] = [];
			if (modifierSource.abilities) { // Base abilities
				abilitiesToCheck.push(...modifierSource.abilities.map(a => ({ ...a, sourceObjectId: modifierSource.objectId })));
			}
			if (modifierSource.currentCharacteristics.grantedAbilities) { // Granted abilities
				abilitiesToCheck.push(...modifierSource.currentCharacteristics.grantedAbilities.map(a => ({ ...a, sourceObjectId: modifierSource.objectId })));
			}

			for (const ability of abilitiesToCheck) {
				if (ability.abilityType !== AbilityType.Passive || !ability.effect || !ability.effect.steps) {
					continue;
				}
				// Check if this ability is negated on its source
				if (modifierSource.currentCharacteristics.negatedAbilityIds?.includes(ability.abilityId)) {
					continue;
				}


				for (const step of ability.effect.steps) {
					if (step.verb === 'MODIFY_PLAY_COST') {
						const params = step.parameters as ModifyPlayCostParameters;
						if (!params || !params.type || params.value === undefined) {
							console.warn(`[RuleAdjudicator] MODIFY_PLAY_COST step on ${modifierSource.name} (Ability: ${ability.abilityId}) is missing critical parameters.`, params);
							continue;
						}

						const appliesTo = (
							evalCard: IGameObject | ICardInstance,
							evalGsm: GameStateManager, // Passed in for consistency, use this.gsm
							evalPlayerId: string,
							evalFromZone: ZoneIdentifier,
							sourceOfModifier: IGameObject // The object providing the passive ability
						): boolean => {
							const cardDef = this.gsm.getCardDefinition(evalCard.definitionId);
							if (!cardDef) return false;

							// Check appliesToPlayers
							if (params.appliesToPlayers) {
								const sourceController = sourceOfModifier.controllerId;
								if (!sourceController) return false; // Modifier source must have a controller

								if (params.appliesToPlayers === 'self' && sourceController !== evalPlayerId) {
									return false;
								}
								if (params.appliesToPlayers === 'opponent' && sourceController === evalPlayerId) {
									return false;
								}
								// 'all' always passes this check
							}

							// Check appliesToCardDefinitionId
							if (params.appliesToCardDefinitionId && cardDef.id !== params.appliesToCardDefinitionId) {
								return false;
							}

							// Check appliesToCardType
							if (params.appliesToCardType && params.appliesToCardType.length > 0) {
								if (!params.appliesToCardType.includes(cardDef.type)) {
									return false;
								}
							}

							// Check appliesToFaction
							if (params.appliesToFaction && cardDef.faction !== params.appliesToFaction) {
								return false;
							}

							// Check originZone
							if (params.originZone && params.originZone.length > 0) {
								if (!params.originZone.includes(evalFromZone)) {
									return false;
								}
							}

							// Placeholder for conditionScript evaluation
							// if (params.conditionScript) {
							//   const scriptResult = this.evaluateConditionScript(params.conditionScript, evalCard, evalPlayerId, evalFromZone, sourceOfModifier);
							//   if (!scriptResult) return false;
							// }

							return true; // All checks passed
						};

						// Pass modifierSource to appliesTo closure
						const boundAppliesTo = (evalCard: IGameObject | ICardInstance, evalGsm: GameStateManager, evalPlayerId: string, evalFromZone: ZoneIdentifier) => {
							return appliesTo(evalCard, evalGsm, evalPlayerId, evalFromZone, modifierSource);
						};


						const newModifier: CostModifier = {
							type: params.type,
							value: params.value,
							appliesTo: boundAppliesTo,
							sourceObjectId: modifierSource.objectId,
						};
						activeModifiers.push(newModifier);
					}
				}
			}
		}
		return activeModifiers;
	}

	/**
	 * Re-evaluates and applies all passive abilities in the game.
	 * This should be called after any event modifies the game state.
	 * Implements Rule 2.3.
	 */
	public applyAllPassiveAbilities(): void {
		const allObjectsFromPlay = this.getAllPlayObjects();
		const allObjectsIncludingHeroes: IGameObject[] = [...allObjectsFromPlay];

		// Add heroes from hero zones
		for (const player of this.gsm.state.players.values()) {
			if (player.zones.heroZone) {
				const heroObjects = player.zones.heroZone.getAll();
				if (heroObjects.length > 0) {
					// Assuming one hero per heroZone, take the first.
					// Or add logic to ensure it's the correct hero if multiple objects could be there.
					allObjectsIncludingHeroes.push(heroObjects[0]);
				}
			}
		}

		// 1. Reset all objects (including heroes) to their base characteristics
		allObjectsIncludingHeroes.forEach((obj) => {
			obj.currentCharacteristics = {
				...obj.baseCharacteristics,
				grantedAbilities: [], // Initialize as empty array
				negatedAbilityIds: [], // Initialize as empty array
				// Ensure statistics and keywords are initialized if not present on baseCharacteristics
                statistics: obj.baseCharacteristics.statistics ? { ...obj.baseCharacteristics.statistics } : { forest: 0, mountain: 0, water: 0, power: 0, health: 0 },
                keywords: obj.baseCharacteristics.keywords ? { ...obj.baseCharacteristics.keywords } : {},
			};
		});

		// 2. Gather all passive abilities from base abilities and granted abilities
		// Filter out negated abilities at this stage.
		const allPassiveAbilities: IAbility[] = [];
		for (const obj of allObjectsIncludingHeroes) { // Iterate over all objects including heroes
			// Ensure sourceObjectId is attached to each ability for context
			const baseAbilities = obj.abilities
				.map((a) => ({ ...a, sourceObjectId: obj.objectId }))
				.filter((a) => a.abilityType === AbilityType.Passive);

			const grantedAbilities = (obj.currentCharacteristics.grantedAbilities || [])
				.map((a) => ({ ...a, sourceObjectId: obj.objectId })) // Granting should set this, but ensure
				.filter((a) => a.abilityType === AbilityType.Passive);

			const currentObjectAbilities = [...baseAbilities, ...grantedAbilities];

			// For Heroes, ensure we are only adding their passives if they are in the HeroZone.
			// This is implicitly handled because we are iterating over objects from player.zones.heroZone.getAll().
			// If a hero is not in the heroZone, it wouldn't be in allObjectsIncludingHeroes via that path.

			for (const ability of currentObjectAbilities) {
				// If an ability is negated on its source object, it should not be collected for application.
				if (!obj.currentCharacteristics.negatedAbilityIds?.includes(ability.abilityId)) {
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
		if (!abilityA.sourceObjectId || !abilityB.sourceObjectId) {
			console.warn('[RuleAdjudicator.doesADependOnB] Abilities missing sourceObjectIds.', abilityA.abilityId, abilityB.abilityId);
			return false;
		}

		const sourceA = this.gsm.getObject(abilityA.sourceObjectId);
		const sourceB = this.gsm.getObject(abilityB.sourceObjectId); // Fetched for completeness, though id is primary for resolveTargetsForDependency

		if (!sourceA) {
			console.warn(`[RuleAdjudicator.doesADependOnB] Source object for ability A (${abilityA.abilityId}, source ID: ${abilityA.sourceObjectId}) not found.`);
			return false;
		}
		if (!sourceB) {
			// While sourceB's object isn't directly used in all checks if abilityB.sourceObjectId is valid for effects,
			// its absence might indicate an issue. For now, we'll proceed if abilityB.sourceObjectId is valid for effect resolution.
			console.warn(`[RuleAdjudicator.doesADependOnB] Source object for ability B (${abilityB.abilityId}, source ID: ${abilityB.sourceObjectId}) not found. Proceeding with ID if available for effects.`);
			// If abilityB.sourceObjectId itself was the issue, the initial check would fail.
		}

		// Rule 2.3.2.g: An ability cannot depend on itself.
		if (abilityA.abilityId === abilityB.abilityId && abilityA.sourceObjectId === abilityB.sourceObjectId) {
			// A more robust check might involve a unique instance ID for abilities if they can be granted multiple times.
			// For now, abilityId + sourceObjectId is a good proxy.
			return false;
		}

		for (const stepB of abilityB.effect.steps) {
			const targetIdsOfB = this.gsm.effectProcessor.resolveTargetsForDependency(
				stepB, // Pass the whole step for resolveTargetsForDependency
				abilityB.sourceObjectId,
				abilityB._triggerPayload
			);

			// Rule 2.3.2.d (Existence): B's application could change A's existence.
			// This means B's effect removes A's source object or negates A's ability.

			// 2.3.2.d.i: B's effect removes sourceA from a zone where its abilities are active,
			// or moves it to a zone where it ceases to exist or its abilities become inactive.
			const removalVerbs = ['moveTo', 'move_to', 'putInZone', 'put_in_zone', 'discard', 'sacrifice', 'destroy_object', 'remove_from_game'];
			if (removalVerbs.includes(stepB.verb.toLowerCase())) {
				if (targetIdsOfB.includes(sourceA.objectId)) {
					const destinationZoneId = stepB.parameters?.destinationZoneIdentifier as ZoneIdentifier | undefined;
					// It could also be a string like 'source_expeditions_choice' which needs resolving,
					// but for dependency, we can be a bit more general. If it *could* go to a bad zone.

					const objectAIsToken = sourceA.baseCharacteristics.isToken === true || sourceA.currentCharacteristics?.isToken === true;

					if (objectAIsToken) {
						// Tokens cease to exist if moved to Hand, Deck, DiscardPile, Limbo (usually), Reserve
						const nonExistenceZonesForTokens: ZoneIdentifier[] = [
							ZoneIdentifier.Hand,
							ZoneIdentifier.Deck,
							ZoneIdentifier.DiscardPile,
							ZoneIdentifier.Limbo, // Typically, unless it's an emblem-like reaction token
							ZoneIdentifier.Reserve,
							// ZoneIdentifier.RemovedFromGame // If this is a formal zone
						];
						if (destinationZoneId && nonExistenceZonesForTokens.includes(destinationZoneId)) {
							console.log(`Dependency: ${abilityA.abilityId} (token source) depends on ${abilityB.abilityId} (moves to non-existence zone ${destinationZoneId})`);
							return true;
						}
						// If destination is dynamic, assume dependency if any potential outcome is a non-existence zone.
						// This part is tricky without fully resolving the destination for dynamic targets.
						// For now, if destinationZoneId is undefined but verb implies removal, and A is a token, assume dependency.
						if (!destinationZoneId && ['sacrifice', 'destroy_object', 'remove_from_game'].includes(stepB.verb.toLowerCase())) {
							console.log(`Dependency: ${abilityA.abilityId} (token source) depends on ${abilityB.abilityId} (verb ${stepB.verb} implies removal)`);
							return true;
						}
					} else { // Non-token
						// Non-tokens lose abilities if moved to hidden zones (Hand, Deck)
						const hiddenZones: ZoneIdentifier[] = [ZoneIdentifier.Hand, ZoneIdentifier.Deck];
						if (destinationZoneId && hiddenZones.includes(destinationZoneId)) {
							console.log(`Dependency: ${abilityA.abilityId} (source) depends on ${abilityB.abilityId} (moves to hidden zone ${destinationZoneId})`);
							return true;
						}
						// Explicit removal
						if (stepB.verb.toLowerCase() === 'remove_from_game' || stepB.verb.toLowerCase() === 'destroy_object' && destinationZoneId === ZoneIdentifier.Limbo) { // Assuming destroy sends to Limbo
						    console.log(`Dependency: ${abilityA.abilityId} (source) depends on ${abilityB.abilityId} (verb ${stepB.verb} implies removal)`);
							return true;
						}
					}
				}
			}

			// 2.3.2.d.ii: B's effect explicitly negates or removes A's specific ability.
			if (stepB.verb.toLowerCase() === 'lose_ability' || stepB.verb.toLowerCase() === 'loseability') {
				if (targetIdsOfB.includes(sourceA.objectId)) {
					if (
						stepB.parameters?.abilityId === abilityA.abilityId ||
						stepB.parameters?.allAbilities === true ||
						(stepB.parameters?.abilityDefinitionId === abilityA.definitionId) // If losing by definition ID
					) {
						console.log(`Dependency: ${abilityA.abilityId} depends on ${abilityB.abilityId} (negates ability)`);
						return true;
					}
				}
			}

			// Rule 2.3.2.e (Applicability): B changes a characteristic that A's targeting or conditions depend on.
			for (const stepA of abilityA.effect.steps) {
				const characteristicsAExtamines = new Set<string>();
				let zoneCriterionA: ZoneIdentifier | string | undefined = undefined; // For zone checks specifically

				// 1. Identify characteristics from stepA.targets.criteria
				if (typeof stepA.targets === 'object' && stepA.targets !== null && (stepA.targets as any).type === 'select') {
					const criteria = (stepA.targets as any).criteria;
					if (criteria) {
						if (criteria.cardType) characteristicsAExtamines.add('type'); // Assuming cardType maps to 'type' characteristic
						if (criteria.subTypes && criteria.subTypes.length > 0) characteristicsAExtamines.add('subTypes');
						if (criteria.keywords && criteria.keywords.length > 0) characteristicsAExtamines.add('keywords');
						if (criteria.controller) characteristicsAExtamines.add('controllerId');
						if (criteria.zone) zoneCriterionA = criteria.zone; // Special handling for zone
						if (criteria.definitionId) characteristicsAExtamines.add('definitionId');
						if (criteria.isToken !== undefined) characteristicsAExtamines.add('isToken');
						if (criteria.isCharacter !== undefined) characteristicsAExtamines.add('isCharacter'); // map to type=Character
						if (criteria.isGigantic !== undefined) characteristicsAExtamines.add('isGigantic');


						if (criteria.stats) { // e.g., { stats: { power: 5, health: ">3" } }
							for (const statKey in criteria.stats) {
								characteristicsAExtamines.add(statKey); // e.g. 'power', 'health'
							}
						}
						// Add any other specific criteria checks that map to characteristics
						// e.g. criteria.name, criteria.faction etc.
					}
				}

				// 2. Identify characteristics from stepA.parameters.condition (if_condition verb)
				if (stepA.verb.toLowerCase() === 'if_condition' && stepA.parameters?.condition) {
					const condition = stepA.parameters.condition as any;
					// This requires parsing the condition structure, which can be complex.
					// Example simple parsing:
					if (condition.type === 'compare_runtime_value') {
						// These are runtime values, not direct characteristics of objects, so skip for now.
					} else if (condition.type === 'check_object_characteristic' && condition.characteristic) {
						characteristicsAExtamines.add(condition.characteristic as string);
						if (condition.zone) zoneCriterionA = condition.zone; // If condition also checks zone
					} else if (condition.type === 'zone_state_check') { // e.g. { type: 'zone_state_check', zone: 'source_hero_expedition', check: 'has_cards_matching', criteria: {...} }
						if (condition.zone) zoneCriterionA = condition.zone;
						if (condition.criteria) { // Nested criteria
							if (condition.criteria.cardType) characteristicsAExtamines.add('type');
							if (condition.criteria.subTypes && condition.criteria.subTypes.length > 0) characteristicsAExtamines.add('subTypes');
							// ... add more from nested criteria
						}
					}
					// Add more comprehensive condition parsing as needed
				}


				// 3. Check if stepB modifies any of these characteristics or zones for any of its targets
				if (characteristicsAExtamines.size > 0 || zoneCriterionA) {
					const modifiedCharByStepB = this.getCharacteristicModifiedByStepB(stepB); // Gets the general characteristic name
					const newZoneSetByStepB = (stepB.verb.toLowerCase() === 'moveTo' || stepB.verb.toLowerCase() === 'move_to' || stepB.verb.toLowerCase() === 'put_in_zone')
						? stepB.parameters?.destinationZoneIdentifier as (ZoneIdentifier | string | undefined)
						: undefined;

					for (const targetIdOfB of targetIdsOfB) { // B affects targetIdOfB
						// It doesn't matter if targetIdOfB is sourceA or another object.
						// We check if B's effect on targetIdOfB could change whether A's condition/targeting (which might involve targetIdOfB or any other object) resolves differently.

						if (modifiedCharByStepB && characteristicsAExtamines.has(modifiedCharByStepB.characteristic)) {
							console.log(`Dependency (Applicability): ${abilityA.abilityId} (examines ${modifiedCharByStepB.characteristic}) depends on ${abilityB.abilityId} (modifies ${modifiedCharByStepB.characteristic} on ${targetIdOfB})`);
							return true; // B modifies a characteristic A examines
						}
						if (zoneCriterionA && newZoneSetByStepB) {
							// If A cares about a zone, and B moves something to or from a zone.
							// This is a broad check. A more precise check would see if the *specific* zone A cares about is affected.
							// e.g. if A targets "cards in hand" and B moves a card to hand or from hand.
							// For now, if B changes *any* zone, and A cares about *any* zone, assume dependency.
							// A more refined check: (newZoneSetByStepB === zoneCriterionA || targetObjectBWasInZoneCriterionA)
							console.log(`Dependency (Applicability - Zone): ${abilityA.abilityId} (zone criterion ${zoneCriterionA}) depends on ${abilityB.abilityId} (moves object ${targetIdOfB} to/from zone)`);
							return true;
						}
						if (zoneCriterionA && stepB.verb.toLowerCase() === 'change_controller' && characteristicsAExtamines.has('controllerId')) {
							// If A's targeting depends on controller (often implied by zone like 'self_hand'),
							// and B changes controller, this could affect zone contents for A.
							console.log(`Dependency (Applicability - Controller/Zone): ${abilityA.abilityId} (zone criterion ${zoneCriterionA}, controller dep) depends on ${abilityB.abilityId} (changes controller of ${targetIdOfB})`);
							return true;
						}

						// Specific verb checks for B that imply characteristic changes A might care about
						if (characteristicsAExtamines.has('subTypes') && (stepB.verb.toLowerCase() === 'add_subtype' || stepB.verb.toLowerCase() === 'remove_subtype')) {
							console.log(`Dependency (Applicability): ${abilityA.abilityId} (examines subTypes) depends on ${abilityB.abilityId} (changes subTypes on ${targetIdOfB})`);
							return true;
						}
						if (characteristicsAExtamines.has('keywords') && (stepB.verb.toLowerCase() === 'grant_keyword' || stepB.verb.toLowerCase() === 'lose_keyword')) {
							console.log(`Dependency (Applicability): ${abilityA.abilityId} (examines keywords) depends on ${abilityB.abilityId} (changes keywords on ${targetIdOfB})`);
							return true;
						}
						if (characteristicsAExtamines.has('controllerId') && stepB.verb.toLowerCase() === 'change_controller') {
							console.log(`Dependency (Applicability): ${abilityA.abilityId} (examines controllerId) depends on ${abilityB.abilityId} (changes controller on ${targetIdOfB})`);
							return true;
						}
						if (characteristicsAExtamines.has('type') && stepB.verb.toLowerCase() === 'set_characteristic' && stepB.parameters?.characteristic === 'type') {
							console.log(`Dependency (Applicability): ${abilityA.abilityId} (examines type) depends on ${abilityB.abilityId} (changes type on ${targetIdOfB})`);
							return true;
						}
						// Check for stats if A examines them
						if (stepB.verb.toLowerCase() === 'modify_statistics' || (stepB.verb.toLowerCase() === 'set_characteristic' && ['power', 'health', 'forest', 'mountain', 'water'].includes(stepB.parameters?.characteristic as string))) {
							const changedStat = stepB.parameters?.characteristic || (stepB.parameters?.statsChange ? Object.keys(stepB.parameters.statsChange)[0] : undefined);
							if (changedStat && characteristicsAExtamines.has(changedStat)) {
								console.log(`Dependency (Applicability): ${abilityA.abilityId} (examines ${changedStat}) depends on ${abilityB.abilityId} (changes ${changedStat} on ${targetIdOfB})`);
								return true;
							}
						}
					}
				}
			}

			// Rule 2.3.2.f (What A Does): B changes a characteristic that A's *effect* relies on for magnitude/nature.
			for (const stepA of abilityA.effect.steps) {
				// 1. Identify characteristics A's effect parameters rely on.
				// This is highly heuristic without structured parameters that declare dependencies.
				// Example: count: "source.power", amount: "target.health"
				// We'll look for such patterns or rely on verb implications.
				const paramsOfA = stepA.parameters || {};
				for (const paramKey in paramsOfA) {
					const paramValue = paramsOfA[paramKey];
					if (typeof paramValue === 'string') {
						const parts = paramValue.split('.'); // e.g., "source.power", "target.health"
						if (parts.length === 2) {
							const objectRef = parts[0]; // "source", "target"
							const charRef = parts[1];   // "power", "health"

							let objectIdAReadsFrom: string | undefined = undefined;
							if (objectRef === 'source' || objectRef === 'self') {
								objectIdAReadsFrom = abilityA.sourceObjectId;
							} else if (objectRef === 'target') {
								// This is hard. Which target? If stepA has multiple targets, or if target is chosen.
								// For now, assume if B modifies this char on *any* of its targets, and A reads this char from *its* target.
								// This is a broad check.
								// A better way: resolve targets of A first, then check against those.
								// This is too complex for current dependency check iteration.
								// Let's simplify: if B modifies charRef on ANY of its targets, and A reads charRef from A's target.
							}

							if (charRef) { // charRef is a characteristic name like 'power'
								const modifiedCharByStepB = this.getCharacteristicModifiedByStepB(stepB);
								if (modifiedCharByStepB && modifiedCharByStepB.characteristic === charRef) {
									// Now check if B's targets include the object A reads from
									if (objectIdAReadsFrom && targetIdsOfB.includes(objectIdAReadsFrom)) {
										console.log(`Dependency (Effect Magnitude): ${abilityA.abilityId} (reads ${charRef} from ${objectIdAReadsFrom}) depends on ${abilityB.abilityId} (modifies ${charRef} on ${objectIdAReadsFrom})`);
										return true;
									}
									// If A reads from 'target' and B modifies that characteristic on one of its targets,
									// it's a potential dependency. This is a simplification.
									if (objectRef === 'target' && targetIdsOfB.length > 0) {
                                        // Check if stepA targets any of targetIdsOfB
                                        const targetsOfStepA_forDependency = this.gsm.effectProcessor.resolveTargetsForDependency(stepA, abilityA.sourceObjectId, abilityA._triggerPayload);
                                        if (targetIdsOfB.some(bTargetId => targetsOfStepA_forDependency.includes(bTargetId))) {
										    console.log(`Dependency (Effect Magnitude - Broad): ${abilityA.abilityId} (reads ${charRef} from its target) depends on ${abilityB.abilityId} (modifies ${charRef} on an object that could be A's target)`);
										    return true;
                                        }
									}
								}
							}
						}
					}
				}
				// Heuristic: if B modifies a characteristic (e.g. 'power') and A's step verb implies using that characteristic (e.g. 'deal_damage_equal_to_power')
				// This is also complex and verb-dependent.
				// Example:
				// if (stepA.verb === 'deal_power_damage' && this.getCharacteristicModifiedByStepB(stepB)?.characteristic === 'power') return true;
			}


			// --- Original simpler heuristic for 2.3.2.f ---
			// This part can be removed or refined if the above is sufficient.
			// const characteristicModifiedByBInStep = this.getCharacteristicModifiedByStepB(stepB);
			// if (characteristicModifiedByBInStep) {
			// 	if (targetIdsOfB.includes(sourceA.objectId)) {
			// 		const characteristicRegex = new RegExp(`\\b${characteristicModifiedByBInStep.characteristic}\\b`, 'i');
			// 		if (abilityA.text && abilityA.text.match(characteristicRegex)) {
			// 			return true;
			// 		}
			// 	}
			// 	if (targetIdsOfB.some((id) => id !== sourceA.objectId)) {
			// 		const characteristicRegex = new RegExp(`\\b${characteristicModifiedByStepB.characteristic}\\b`, 'i');
			// 		if (abilityA.text && abilityA.text.match(characteristicRegex)) {
			// 			return true;
			// 		}
			// 	}
			// }
		}
		return false;
	}

	/**
	 * Helper to identify what characteristic a step of B might modify.
	 * Used for Rule 2.3.2.f heuristics.
	 */
	private getCharacteristicModifiedByStepB(stepB: IEffectStep): { characteristic: string; modificationType: 'set' | 'modify' | 'keyword' | 'subtype' | 'controller' | 'zone' } | null {
		const verb = stepB.verb.toLowerCase();
		const params = stepB.parameters;

		if (verb === 'modify_statistics' || verb === 'modifystatistics') {
			if (params?.statsChange) {
				const statKeys = Object.keys(params.statsChange);
				if (statKeys.length > 0) return { characteristic: statKeys[0], modificationType: 'modify' }; // general stat modification
			}
			// Older style params
			if (params?.power) return { characteristic: 'power', modificationType: 'modify' };
			if (params?.health) return { characteristic: 'health', modificationType: 'modify' };
			if (params?.forest) return { characteristic: 'forest', modificationType: 'modify' };
			if (params?.mountain) return { characteristic: 'mountain', modificationType: 'modify' };
			if (params?.water) return { characteristic: 'water', modificationType: 'modify' };
		} else if (verb === 'set_characteristic' || verb === 'setcharacteristic') {
			if (params?.characteristic && typeof params.characteristic === 'string') {
				return { characteristic: params.characteristic, modificationType: 'set' };
			}
		} else if (verb === 'add_subtype' || verb === 'addsubtype' || verb === 'remove_subtype' || verb === 'removesubtype') {
			return { characteristic: 'subTypes', modificationType: 'subtype' };
		} else if (verb === 'grant_keyword' || verb === 'grantkeyword' || verb === 'lose_keyword' || verb === 'losekeyword') {
			if (params?.keyword && typeof params.keyword === 'string') {
				return { characteristic: 'keywords', modificationType: 'keyword' }; // Could also be params.keyword itself
			}
		} else if (verb === 'change_controller' || verb === 'changecontroller') {
			return { characteristic: 'controllerId', modificationType: 'controller' };
		} else if (verb === 'moveTo' || verb === 'move_to' || verb === 'put_in_zone' || verb === 'putinzone') {
			return { characteristic: 'zone', modificationType: 'zone' }; // Object's zone changes
		}
		// The following block was identified as misplaced and refers to variables (abilityA, targetIdsOfB) not in this scope.
		// It seems like a copy-paste error from the doesADependOnB method or a similar context.
		// Removing this block to fix syntax and scope errors within getCharacteristicModifiedByStepB.
		/*
			// This applies if B targets *any* object, and A's criteria might now match or unmatch.
			if (abilityA.effect.targetCriteria) { // Assuming targetCriteria holds conditions for A's targets
				const criteria = abilityA.effect.targetCriteria as any; // Cast to any for dynamic property access

				for (const targetIdOfB of targetIdsOfB) {
					// It doesn't matter if targetIdOfB is sourceA or another object.
					// We are checking if B's effect on targetIdOfB could change whether A applies to *something*.

					if (stepB.verb === 'set_characteristic' || stepB.verb === 'setCharacteristic') {
						const char = stepB.parameters?.characteristic as string;
						const val = stepB.parameters?.value;
						if (criteria.type && char === 'type' && (val === criteria.type || this.gsm.getObject(targetIdOfB)?.currentCharacteristics.type === criteria.type)) return true;
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
			const characteristicModifiedByBInStep = this.getCharacteristicModifiedByStepB(stepB); // Recursive call here, ensure base case or guard

			if (characteristicModifiedByBInStep) { // characteristicModifiedByBInStep is an object, not a string here due to previous fix
				// 2.3.2.f.i: B changes a characteristic of A's source object that A's effect relies on.
				if (targetIdsOfB.includes(sourceA.objectId)) { // sourceA not in scope
					const characteristicRegex = new RegExp(`\\b${characteristicModifiedByBInStep.characteristic}\\b`, 'i');
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
				if (targetIdsOfB.some((id) => id !== sourceA.objectId)) { // sourceA not in scope
					const characteristicRegex = new RegExp(`\\b${characteristicModifiedByBInStep.characteristic}\\b`, 'i');
					if (abilityA.text.match(characteristicRegex)) {
						// Example: A is "All Goblins get +1/+1 for each artifact you control".
						// B changes an artifact's characteristic (e.g. makes it not an artifact, or changes a count).
						// This is very simplified.
						return true;
					}
				}
			}
		*/
		return null; // Default return for getCharacteristicModifiedByStepB
	}

	// Removed duplicate/simpler getCharacteristicModifiedByStepB method
	// The more detailed one returning an object is kept above.

	private sortAbilitiesByDependency(abilities: IAbility[]): IAbility[] {
		let unappliedAbilities = [...abilities];
		const sortedAbilities: IAbility[] = [];
		// const appliedTimestamps = new Set<number>(); // Removed as it's unused due to simplified tie-breaking

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
				const objA = this.gsm.getObject(a.sourceObjectId || '');
				const objB = this.gsm.getObject(b.sourceObjectId || '');
				if (!objA || !objB) {
					console.warn('[RuleAdjudicator] Could not find source object for one or more abilities during sorting:', a.abilityId, b.abilityId);
					return 0;
				}
				if (objA.timestamp === objB.timestamp) {
					return 0; // Stable sort for tie-breaking
				}
				return objA.timestamp - objB.timestamp; // Sort by smallest timestamp first.
			});

			if (freeAbilities.length > 0) {
				const nextAbility = freeAbilities[0];
				sortedAbilities.push(nextAbility);
				unappliedAbilities = unappliedAbilities.filter((a) => a !== nextAbility);
				// const sourceObject = this.gsm.getObject(nextAbility.sourceObjectId || ''); // Not needed for appliedTimestamps anymore
				// if (sourceObject) {
					// appliedTimestamps.add(sourceObject.timestamp); // Removed
				// }
			}
			// The following 'else if' block is removed because the primary fallback
			// (freeAbilities = [...unappliedAbilities];) ensures that if unappliedAbilities is not empty,
			// freeAbilities will also not be empty, so this 'else if' branch would not be hit.
			// else if (unappliedAbilities.length > 0) { ... }
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
			case 'gigantic':
				(target.currentCharacteristics as any).isGigantic = true;
				// Rule 7.4.4.n: "If a non-Gigantic Character would gain Gigantic, it remains in the Expedition
				// containing the card that represents it and joins the other Expedition of its controller."
				// This "join" is conceptual. Standard "object enters zone" triggers for the "other" expedition
				// will not fire from this characteristic change alone. If specific triggers are needed for this
				// conceptual join, they would need to be custom-handled, possibly by publishing a specific event here.
				// TODO: Verify if specific triggers for "conceptually joining other expedition" are needed.
				console.log(`[RuleAdjudicator] ${target.name} gained Gigantic. Conceptually present in other expedition.`);
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
			case 'gigantic':
				(target.currentCharacteristics as any).isGigantic = false;
				// Rule 7.4.4.o: "If a Gigantic Character would lose Gigantic, it remains in the Expedition
				// that contains the card that represents it and leaves the other Expedition of its controller."
				// This "leave" is conceptual. Standard "object leaves zone" triggers for the "other" expedition
				// will not fire from this characteristic change alone. If specific triggers are needed,
				// they would need to be custom-handled.
				// TODO: Verify if specific triggers for "conceptually leaving other expedition" are needed.
				console.log(`[RuleAdjudicator] ${target.name} lost Gigantic. No longer conceptually present in other expedition.`);
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

	// Make sure this is public if called from outside, or refactor applyAllPassiveAbilities
	public applyAbility(ability: IAbility): void {
		if (!ability.sourceObjectId) {
			console.warn(`[RuleAdjudicator] Ability ${ability.abilityId} is missing sourceObjectId.`);
			return;
		}
		const sourceObject = this.gsm.getObject(ability.sourceObjectId);
		if (!sourceObject) {
			console.warn(
				`[RuleAdjudicator] Source object ${ability.sourceObjectId} not found for ability ${ability.abilityId}`
			);
			return;
		}

		// Ensure currentCharacteristics exists on sourceObject
		if (!sourceObject.currentCharacteristics) {
			sourceObject.currentCharacteristics = {
				...sourceObject.baseCharacteristics,
				grantedAbilities: [],
				negatedAbilityIds: [],
				statistics: sourceObject.baseCharacteristics.statistics ? { ...sourceObject.baseCharacteristics.statistics } : { forest: 0, mountain: 0, water: 0, power: 0, health: 0 },
                keywords: sourceObject.baseCharacteristics.keywords ? { ...sourceObject.baseCharacteristics.keywords } : {},
			};
		}

		console.log(
			`[RuleAdjudicator] Applying passive ability ${ability.abilityId} from ${sourceObject.name} (${sourceObject.objectId})`
		);

		// Handle keyword abilities that are defined by the ability.keyword property itself
        // (This is for abilities that *are* keywords, like "Eternal" defined as an ability object)
		if (ability.isKeyword && ability.keyword && Object.values(KeywordAbility).includes(ability.keyword)) {
			// The target of such a keyword ability is its source object.
			this._grantKeyword(sourceObject, ability.keyword, ability.keywordValue); // Use keywordValue for things like Scout X
		}

		// Process effect steps if they exist
		// These steps define what the ability *does* (e.g., grant another keyword, modify stats, etc.)
		for (const step of ability.effect.steps) {
			let targetsOfStep: IGameObject[] = [];

			// Determine targets for this step.
			if (step.targets === 'self') {
				targetsOfStep = [sourceObject];
			} else if (typeof step.targets === 'object' && step.targets.type === 'select') {
				// This is more complex for passives. Typically passives affect 'self' or are global.
				// If a passive needs to select targets, EffectProcessor might be needed.
				// For now, this example assumes passives primarily target 'self' or have global-like conditions handled in appliesTo.
				// Or, if a passive grants an ability to another object, that's handled by 'grant_ability' verb with specific parameters.
				console.warn(`[RuleAdjudicator] Passive ability step for ${ability.abilityId} has complex target selection. This may need EffectProcessor involvement or a different design for passive targeting.`);
				// Defaulting to self for safety, but this needs review based on game design.
				targetsOfStep = [sourceObject];
			} else {
				// Default to 'self' if target is undefined or not 'select'
				targetsOfStep = [sourceObject];
			}

			for (const target of targetsOfStep) {
				if (!target.currentCharacteristics) { // Ensure target also has currentCharacteristics
					target.currentCharacteristics = {
						...target.baseCharacteristics,
						grantedAbilities: [],
						negatedAbilityIds: [],
						statistics: target.baseCharacteristics.statistics ? { ...target.baseCharacteristics.statistics } : { forest: 0, mountain: 0, water: 0, power: 0, health: 0 },
						keywords: target.baseCharacteristics.keywords ? { ...target.baseCharacteristics.keywords } : {},
					};
				}

				// Skip applying effect step if the source ability is negated on the target
				// This is mostly relevant if a passive can target other objects. For 'self' target, this is covered by the initial check.
				if (target.objectId !== sourceObject.objectId && target.currentCharacteristics.negatedAbilityIds?.includes(ability.abilityId)) {
					console.log(`[RuleAdjudicator] Skipping effect step for ${ability.abilityId} on target ${target.name} because ability is negated on target.`);
					continue;
				}


				switch (step.verb.toLowerCase()) {
					case 'modify_statistics':
					case 'modifystatistics':
						this._modifyStatistics(target, step.parameters);
						break;
					case 'grant_keyword':
					case 'grantkeyword':
						if (step.parameters?.keyword && typeof step.parameters.keyword === 'string') {
							this._grantKeyword(target, step.parameters.keyword, (step.parameters as any).value);
						} else {
							console.warn(`[RuleAdjudicator] grant_keyword step for ${ability.abilityId} missing or invalid keyword parameter.`);
						}
						break;
					case 'lose_keyword':
					case 'losekeyword':
						if (step.parameters?.keyword && typeof step.parameters.keyword === 'string') {
							this._loseKeyword(target, step.parameters.keyword);
						} else {
							console.warn(`[RuleAdjudicator] lose_keyword step for ${ability.abilityId} missing or invalid keyword parameter.`);
						}
						break;
					case 'set_characteristic':
					case 'setcharacteristic':
						if (step.parameters?.characteristic && typeof step.parameters.characteristic === 'string' && step.parameters.value !== undefined) {
							this._setCharacteristic(
								target,
								step.parameters.characteristic,
								step.parameters.value
							);
						} else {
							console.warn(`[RuleAdjudicator] set_characteristic step for ${ability.abilityId} missing or invalid parameters.`);
						}
						break;
					case 'grant_ability':
					case 'grantability':
						// sourceObject.objectId is the object granting the ability via its passive effect.
						if (step.parameters?.ability && sourceObject.objectId) {
							this._grantAbility(target, step.parameters.ability, sourceObject.objectId);
						} else {
							console.warn(`[RuleAdjudicator] grant_ability step for ${ability.abilityId} missing parameters or source object ID.`);
						}
						break;
					case 'lose_ability':
					case 'loseability':
						this._loseAbility(target, step.parameters);
						break;
					// MODIFY_PLAY_COST is not "applied" as an effect here, it's interpreted by getActiveCostModifiersForCardPlay
					case 'modify_play_cost':
						// This verb is handled by getActiveCostModifiersForCardPlay, not directly applied as a characteristic change.
						// No action needed here during applyAbility pass for this verb.
						break;
					default:
						// Check if verb matches a known keyword directly (legacy/simple setup)
						if (Object.values(KeywordAbility).includes(step.verb as KeywordAbility)) {
							this._grantKeyword(target, step.verb); // Granting the verb itself as a keyword
						} else {
							console.warn( // Changed from log to warn
								`[RuleAdjudicator] Passive ability ${ability.abilityId} step verb '${step.verb}' has no specific application logic in applyAbility.`
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

	/**
	 * Gets all active modifiers relevant to the current game context/event.
	 * Rule 6.2
	 * @param context An object describing the current action/event, e.g.,
	 *                { type: 'EFFECT_STEP', step: IEffectStep, sourceObject: IGameObject }
	 *                { type: 'COST_CALCULATION', card: ICardInstance|IGameObject, playerId: string }
	 * @returns An array of IModifier objects.
	 */
	public getActiveModifiers(context: {
		type: 'EFFECT_STEP';
		step: IEffectStep;
		sourceObjectOfStep: IGameObject; // Object whose effect is being modified
		effectContext: any; // The broader runtime context of the effect (e.g., resolved targets of the original step)
	}): IModifier[] {
		const activeModifiers: IModifier[] = [];
		const potentialModifierSources: (IGameObject | IEmblemObject)[] = [...this.getAllPlayObjects()];

		// Add emblems if they are stored in a known, accessible location
		// Example: if (this.gsm.state.sharedZones.emblems) { potentialModifierSources.push(...this.gsm.state.sharedZones.emblems.getAll()); }
		// For now, assuming emblems are IGameObjects and will be found by getAllPlayObjects if in a scanned zone.

		for (const source of potentialModifierSources) {
			const abilitiesToCheck: IAbility[] = [];
			if (source.abilities) {
				abilitiesToCheck.push(...source.abilities.map(a => ({ ...a, sourceObjectId: source.objectId })));
			}
			if ('currentCharacteristics' in source && source.currentCharacteristics?.grantedAbilities) {
				abilitiesToCheck.push(...source.currentCharacteristics.grantedAbilities.map(a => ({ ...a, sourceObjectId: source.objectId })));
			} else if ('grantedAbilities' in source && source.grantedAbilities) { // For IEmblemObject if it has grantedAbilities directly
				abilitiesToCheck.push(...(source.grantedAbilities as IAbility[]).map(a => ({...a, sourceObjectId: source.objectId })));
			}

			for (const ability of abilitiesToCheck) {
				if (ability.abilityType !== AbilityType.Passive || !ability.effect || !ability.effect.steps) {
					continue;
				}
				if ('currentCharacteristics' in source && source.currentCharacteristics?.negatedAbilityIds?.includes(ability.abilityId)) {
					continue;
				}

				ability.effect.steps.forEach((step, stepIndex) => {
					let definedModifierType: ModifierType | null = null;
					let effectStepProperty: 'replacementEffectStep' | 'additionalEffectStep' | null = null;

					switch (step.verb) {
						case 'DEFINE_REPLACEMENT_MODIFIER':
							definedModifierType = ModifierType.ReplaceStep;
							effectStepProperty = 'replacementEffectStep';
							break;
						case 'DEFINE_ADD_STEP_BEFORE_MODIFIER':
							definedModifierType = ModifierType.AddStepBefore;
							effectStepProperty = 'additionalEffectStep';
							break;
						case 'DEFINE_ADD_STEP_AFTER_MODIFIER':
							definedModifierType = ModifierType.AddStepAfter;
							effectStepProperty = 'additionalEffectStep';
							break;
						default:
							return; // Not a modifier definition step
					}

					const modParams = step.parameters as any;
					if (!modParams || !modParams.criteria || !modParams[effectStepProperty!]) {
						console.warn(`[RuleAdjudicator] Modifier definition step ${step.verb} on ${source.name} (Ability: ${ability.abilityId}) is missing critical parameters.`);
						return;
					}

					let criteriaMet = true;
					const criteria = modParams.criteria as IModifier['applicationCriteria'];

					if (context.type === 'EFFECT_STEP') {
						if (criteria.verb) {
							const verbs = Array.isArray(criteria.verb) ? criteria.verb : [criteria.verb];
							if (!verbs.includes(context.step.verb)) criteriaMet = false;
						}
						if (criteriaMet && criteria.sourceCardDefinitionId) {
							if (context.sourceObjectOfStep?.definitionId !== criteria.sourceCardDefinitionId) criteriaMet = false;
						}
						if (criteriaMet && criteria.targetIncludesDefinitionId) {
							const resolvedTargets = context.effectContext?.resolvedTargets as IGameObject[] | undefined;
							if (!resolvedTargets || !resolvedTargets.some(t => t.definitionId === criteria.targetIncludesDefinitionId)) criteriaMet = false;
						}
						if (criteriaMet && criteria.customCondition) {
							if (!criteria.customCondition(context.effectContext, this.gsm)) criteriaMet = false;
						}
					} else {
						// Handle other context types if necessary, or assume criteria don't apply
						// criteriaMet = false;
					}

					if (criteriaMet) {
						let priority = source.timestamp; // Default priority
						if (modParams.priority !== undefined) {
							priority = modParams.priority;
						} else if (modParams.prioritySource === 'objectTimestamp' && source.timestamp !== undefined) {
							priority = source.timestamp;
						}

						const effectStepPayload = JSON.parse(JSON.stringify(modParams[effectStepProperty!]));

						const newModifier: IModifier = {
							modifierId: `${source.objectId}_${ability.abilityId}_${stepIndex}`,
							sourceObjectId: source.objectId,
							modifierType: definedModifierType!,
							priority: priority,
							applicationCriteria: JSON.parse(JSON.stringify(criteria)),
							replacementEffectStep: definedModifierType === ModifierType.ReplaceStep ? effectStepPayload : undefined,
							additionalEffectStep: (definedModifierType === ModifierType.AddStepBefore || definedModifierType === ModifierType.AddStepAfter) ? effectStepPayload : undefined,
							canBeModified: modParams.modifierRuleCanBeModified !== undefined ? modParams.modifierRuleCanBeModified : true,
						};
						activeModifiers.push(newModifier);
					}
				});
			}
		}

		activeModifiers.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority - b.priority;
			const sourceA = this.gsm.getObject(a.sourceObjectId);
			const sourceB = this.gsm.getObject(b.sourceObjectId);
			if (sourceA && sourceB && sourceA.timestamp !== sourceB.timestamp) return sourceA.timestamp - sourceB.timestamp;
			return 0;
		});

		if (activeModifiers.length > 0) {
			console.log(`[RuleAdjudicator] Found ${activeModifiers.length} active modifiers for context:`, context, activeModifiers);
		}
		return activeModifiers;
	}

	// New method for Rule 5.2.b
	public getPassivesGrantingItemsOnPlay(
		playedCardObject: IGameObject,
		_playingPlayerId: string, // playingPlayerId might be used for context in targetCriteria or sourceCondition
		_gameState: IGameState // gameState might be used for complex sourceCondition checks
	): {
		passiveAbility: IAbility;
		sourceObject: IGameObject;
		itemToGrant: { type: 'counter'; counterType: CounterType; amount: number } | { type: 'status'; statusType: StatusType };
	}[] {
		const results: {
			passiveAbility: IAbility;
			sourceObject: IGameObject;
			itemToGrant: { type: 'counter'; counterType: CounterType; amount: number } | { type: 'status'; statusType: StatusType };
		}[] = [];

		const potentialSources = this.getAllObjectsAndHeroesInPlay(); // Helper to get all relevant objects

		for (const sourceObject of potentialSources) {
			if (sourceObject.objectId === playedCardObject.objectId) {
				continue; // The card being played cannot grant items to itself via this mechanism
			}

			const abilitiesToCheck: IAbility[] = [];
			if (sourceObject.abilities) {
				abilitiesToCheck.push(...sourceObject.abilities.map(a => ({ ...a, sourceObjectId: sourceObject.objectId })));
			}
			if (sourceObject.currentCharacteristics?.grantedAbilities) {
				abilitiesToCheck.push(...sourceObject.currentCharacteristics.grantedAbilities.map(a => ({ ...a, sourceObjectId: sourceObject.objectId })));
			}

			for (const ability of abilitiesToCheck) {
				if (ability.abilityType !== AbilityType.Passive || !ability.effect || !ability.effect.steps) {
					continue;
				}
				if (sourceObject.currentCharacteristics?.negatedAbilityIds?.includes(ability.abilityId)) {
					continue; // Skip negated abilities
				}

				for (const step of ability.effect.steps) {
					if (step.verb === 'DEFINE_PASSIVE_GRANT_ON_PLAY') {
						const params = step.parameters as PassiveGrantOnPlayParameters | undefined;
						if (!params || !params.itemToGrant) {
							console.warn(`[RuleAdjudicator.getPassivesGrantingItemsOnPlay] DEFINE_PASSIVE_GRANT_ON_PLAY step on ${sourceObject.name} (Ability: ${ability.abilityId}) is missing itemToGrant.`, params);
							continue;
						}

						// 1. Check sourceCondition (conceptual for now)
						// if (params.sourceCondition && !this.evaluateCondition(params.sourceCondition, sourceObject, this.gsm)) {
						//     continue;
						// }
						// Assuming sourceCondition is met if not specified or for simplicity here.

						// 2. Check targetCriteria against playedCardObject
						let targetCriteriaMet = true;
						if (params.targetCriteria) {
							const defOfPlayedCard = this.gsm.getCardDefinition(playedCardObject.definitionId);
							if (!defOfPlayedCard) {
								targetCriteriaMet = false; // Should not happen if playedCardObject is valid
							} else {
								if (params.targetCriteria.cardType && !params.targetCriteria.cardType.includes(defOfPlayedCard.type)) {
									targetCriteriaMet = false;
								}
								if (targetCriteriaMet && params.targetCriteria.faction && defOfPlayedCard.faction !== params.targetCriteria.faction) {
									targetCriteriaMet = false;
								}
								if (targetCriteriaMet && params.targetCriteria.definitionId && defOfPlayedCard.id !== params.targetCriteria.definitionId) {
									targetCriteriaMet = false;
								}
								// TODO: Add more criteria checks as defined in PassiveGrantOnPlayParameters.targetCriteria
							}
						}

						if (targetCriteriaMet) {
							results.push({
								passiveAbility: ability,
								sourceObject: sourceObject,
								itemToGrant: params.itemToGrant
							});
							console.log(`[RuleAdjudicator.getPassivesGrantingItemsOnPlay] Found qualifying passive: ${ability.abilityId} on ${sourceObject.name} for played card ${playedCardObject.name}. Item:`, params.itemToGrant);
						}
					}
				}
			}
		}
		return results;
	}

	/**
	 * Helper to get all objects in play zones (Expedition, Landmark) and Heroes in Hero Zones.
	 */
	private getAllObjectsAndHeroesInPlay(): IGameObject[] {
		const objects: IGameObject[] = [];
		// From shared expedition zone
		if (this.gsm.state.sharedZones?.expedition) {
			objects.push(...this.gsm.state.sharedZones.expedition.getAll().filter(isGameObject));
		}
		// From player-specific landmark and hero zones
		for (const player of this.gsm.state.players.values()) {
			if (player.zones.landmarkZone) {
				objects.push(...player.zones.landmarkZone.getAll().filter(isGameObject));
			}
			if (player.zones.heroZone) { // Assuming heroes are IGameObjects
				objects.push(...player.zones.heroZone.getAll().filter(isGameObject));
			}
			// Potentially add Battlefield zones if they exist and can have objects with such passives
			// Example: if (player.zones.battlefieldZone) { objects.push(...player.zones.battlefieldZone.getAll().filter(isGameObject)); }
		}
		return objects;
	}
}
