import type { CounterType } from './enums'; // FIX: Imported CounterType
import type { IGameObject } from './objects'; // FIX: Imported IGameObject
import type { GameStateManager } from '../GameStateManager'; // FIX: Imported GameStateManager

/**
 * Represents the cost to play a card or activate an ability.
 * Rule 1.2.5, 6.4
 */
export interface ICost {
    mana?: number;
    discard?: { count: number; criteria?: any }; // criteria can be further defined
    exhaustSelf?: boolean;
    sacrifice?: { count: number; criteria?: any };
    spendCounters?: { type: CounterType; amount: number };
}

/**
 * Represents a single step within an effect's resolution.
 * Rule 1.2.6, 6.5
 */
export interface IEffectStep {
    verb: string; // e.g., 'draw', 'createToken', 'gainStatus'
    targets: 'self' | 'controller' | { type: 'select', criteria: any }; // Target selection
    parameters?: any; // Verb-specific data, like a status type
    isOptional?: boolean; // For "may" effects (Rule 1.2.6.d, 6.5.c)
}

/**
 * Represents the full effect of an ability or spell.
 * Rule 1.2.6
 */
export interface IEffect {
    steps: IEffectStep[];
    sourceObjectId?: string; // The object that generated this effect
    _triggerPayload?: any; // FIX: Added optional property for internal use
}

/**
 * Defines the trigger condition for a Reaction ability.
 * Rule 6.3
 */
export interface ITrigger {
    eventType: string; // e.g., 'entityMoved', corresponds to an EventBus event type
    // A function to check if the specific event payload meets the trigger's conditions
    // Rule 6.3.b, 6.3.k
    condition: (payload: any, sourceObject: IGameObject, gsm: GameStateManager) => boolean;
}

export enum AbilityType {
    QuickAction = "quick_action",
    Reaction = "reaction",
    Passive = "passive",
    EffectSource = "effect_source", // For simple effects from spells etc.
}

/**
 * Represents a single ability on a card or object.
 * Rule 1.2.4, 2.2.11
 */
export interface IAbility {
    sourceObjectId?: string; // Set when instantiated on an object
    abilityId: string; // Unique within the card definition
    abilityType: AbilityType;
    cost?: ICost; // For quick actions
    trigger?: ITrigger; // For reactions
    isSelfMove?: boolean; // Rule 6.3.c
    effect: IEffect;
    text: string; // Original card text for display/reference
    isSupportAbility: boolean; // Rule 2.2.11.c
}