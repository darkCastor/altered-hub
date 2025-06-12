import type { CounterType, KeywordAbility } from './enums';
import type { IGameObject } from './objects';
import type { GameStateManager } from '../GameStateManager';

/**
 * Represents the cost to play a card or activate an ability.
 * Rule 1.2.5, 6.4
 */
export interface ICost {
	mana?: number;
	discard?: { count: number; criteria?: unknown }; // criteria can be further defined
	exhaustSelf?: boolean;
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
	parameters?: Record<string, unknown> | undefined; // Verb-specific data, like a status type or counter info
	isOptional?: boolean; // For "may" effects (Rule 1.2.6.d, 6.5.c)
}

/**
 * Represents the full effect of an ability or spell.
 * Rule 1.2.6
 */
export interface IEffect {
	steps: IEffectStep[];
	sourceObjectId?: string; // The object that generated this effect
	_triggerPayload?: unknown;
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
}
