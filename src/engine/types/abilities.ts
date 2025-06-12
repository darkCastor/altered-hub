import type { CounterType, KeywordAbility, CardType, ZoneIdentifier, StatusType, ModifierType } from './enums';
import type { IGameObject, ICardInstance } from './objects';
import type { GameStateManager } from '../GameStateManager';

/**
 * Represents the cost to play a card or activate an ability.
 * Rule 1.2.5, 6.4
 */
export interface ICost {
	mana?: number;
	discard?: { count: number; criteria?: unknown }; // criteria can be further defined
	exhaustSelf?: boolean;
	discardSelfFromReserve?: boolean; // Added for quick actions that discard the source card from reserve
	sacrifice?: { count: number; criteria?: unknown };
	spendCounters?: { type: CounterType; amount: number };
}

/**
 * Represents a single step within an effect's resolution.
 * Rule 1.2.6, 6.5
 */
export interface IEffectStep {
	verb: string; // e.g., 'draw', 'createToken', 'gainStatus', 'gainCounter'
	targets: 'self' | 'controller' | { type: 'select'; criteria: unknown }; // Target selection
	parameters?: {
		// Common parameters
		count?: number | string; // Can be a number or a string key for a value in currentContext._effectRuntimeValues
		repeat?: number | string; // For repeating the step X times
		targetKey?: string; // To pick a specific target from preSelectedTargets

		// Verb-specific parameters
		tokenDefinitionId?: string; // For create_token
		destinationExpeditionType?: 'hero' | 'companion' | 'source_assigned_or_choice'; // For create_token
		controllerId?: string; // For create_token, change_controller
		ability?: any; // For gain_ability (should be IAbilityDefinition structure)
		counterType?: CounterType; // For gain_counters, lose_counters, augment_counters
		amount?: number; // For gain_counters, lose_counters
		statusType?: StatusType; // For gain_status, lose_status
		destinationZoneIdentifier?: ZoneIdentifier | 'source_expeditions_choice'; // For put_in_zone
		sourceObjectForContextOverrideId?: string; // For put_in_zone with 'source_expeditions_choice'
		cardIds?: string[]; // For discard_cards (specific cards)

		// For IF_CONDITION verb
		condition?: any; // Define specific condition structure, e.g., { type: 'compare_runtime_value', key: string, operator: string, value: any } or { type: 'check_game_state', ... }
		then_steps?: IEffectStep[];
		else_steps?: IEffectStep[];

		// For CHOOSE_MODE verb
		prompt?: string;
		modes?: { [choiceKey: string]: IEffectStep[] }; // Key: choice identifier, Value: array of steps for that mode
		chooseCount?: number;

		// For MODIFY_PLAY_COST (already part of union via ModifyPlayCostParameters)
		[key: string]: any; // Allows other verb-specific parameters & ModifyPlayCostParameters
	} | ModifyPlayCostParameters | undefined;
	isOptional?: boolean; // For "may" effects (Rule 1.2.6.d, 6.5.c)
	canBeModified?: boolean; // Defaults to true. If false, this step cannot be further modified.
}

/**
 * Parameters for the 'MODIFY_PLAY_COST' effect verb.
 * These parameters define how a card's play cost should be modified by a passive ability.
 */
export interface ModifyPlayCostParameters {
	type: 'increase' | 'decrease' | 'set' | 'minimum' | 'maximum';
	value: number;
	// Applicability criteria:
	appliesToCardType?: CardType[]; // e.g., [CardType.Spell]
	appliesToFaction?: string; // Faction name
	appliesToCardDefinitionId?: string; // Specific card definition ID
	appliesToPlayers?: 'self' | 'opponent' | 'all'; // Whose card play is affected
	originZone?: ZoneIdentifier[]; // e.g., only if played from Hand [ZoneIdentifier.Hand]

	/**
	 * A string representation of a condition that must be true for this modifier to apply.
	 * This would be parsed and evaluated by the RuleAdjudicator.
	 * Example: "sourceController === playingPlayer"
	 *          "playingPlayerHandSize >= 5"
	 * The evaluation context would include (card, gsm, playerId, fromZone, sourceObject).
	 */
	conditionScript?: string;
}

/**
 * Represents the full effect of an ability or spell.
 * Rule 1.2.6
 */
// import type { IGameObject } from './objects'; // Already imported above

export interface IEffect {
	steps: IEffectStep[];
	sourceObjectId?: string; // The object that generated this effect
	_triggerPayload?: unknown;
	_lkiSourceObject?: Readonly<IGameObject>; // Last Known Information
}

/**
 * Defines the trigger condition for a Reaction ability.
 * Rule 6.3
 */
export interface ITrigger {
	eventType: string; // e.g., 'entityMoved', corresponds to an EventBus event type
	// A function to check if the specific event payload meets the trigger's conditions
	// Rule 6.3.b, 6.3.k
	condition: (payload: unknown, sourceObject: IGameObject, gsm: GameStateManager) => boolean;
}

export enum AbilityType {
	QuickAction = 'quick_action',
	Reaction = 'reaction',
	Passive = 'passive',
	Support = 'support', // Rule 2.2.11.e - Support abilities work only in Reserve
	EffectSource = 'effect_source' // For simple effects from spells etc.
}

/**
 * Represents a single ability on a card or object.
 * Rule 1.2.4, 2.2.11
 */
export interface IAbility {
	sourceObjectId?: string;
	abilityId: string;
	abilityType: AbilityType;
	cost?: ICost;
	trigger?: ITrigger;
	isSelfMove?: boolean; // You have this, good!
	effect: IEffect;
	text: string;
	isSupportAbility: boolean;
	isKeyword?: boolean;
	keyword?: KeywordAbility;
	keywordValue?: number; // For keywords like Scout X and Tough X
	reactionActivationsToday?: number; // For NIF Rule 1.4.6.c
	isTemporary?: boolean; // For abilities granted temporarily, e.g., by Scout
}

// --- MODIFIERS --- Rule 6.2

export interface IModifier {
	modifierId: string; // Unique ID for this modifier instance
	sourceObjectId: string; // ID of the game object or emblem generating this
	modifierType: ModifierType;
	priority: number; // For ordering, e.g., timestamp of source object or explicit

	applicationCriteria: {
		verb?: string | string[]; // Specific verb(s) this modifier applies to
		sourceCardDefinitionId?: string; // Does it apply to effects from a specific card definition?
		targetIncludesDefinitionId?: string; // Does it apply if a target matches this definition?
		customCondition?: (context: any, gameStateManager: any) => boolean; // For more complex conditions
		// Potentially add more criteria: e.g., based on player, zone, card type of source/target
	};

	replacementEffectStep?: IEffectStep; // For ReplaceStep
	additionalEffectStep?: IEffectStep;  // For AddStepBefore/AddStepAfter

	canBeModified?: boolean; // Defaults to true. If false, this modifier's effect step cannot be modified.
}
