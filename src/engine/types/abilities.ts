import type { CounterType } from './enums'; 
import type { IGameObject } from './objects'; 
import type { GameStateManager } from '../GameStateManager'; 

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
    verb: string; // e.g., 'draw', 'createToken', 'gainStatus', 'gainCounter'
    targets: 'self' | 'controller' | { type: 'select', criteria: any }; // Target selection
    parameters?: any; // Verb-specific data, like a status type or counter info
    isOptional?: boolean; // For "may" effects (Rule 1.2.6.d, 6.5.c)
}

/**
 * Represents the full effect of an ability or spell.
 * Rule 1.2.6
 */
export interface IEffect {
    steps: IEffectStep[];
    sourceObjectId?: string; // The object that generated this effect
    _triggerPayload?: any; 
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
    keyword?: 'Eternal' | 'Defender' | 'Gigantic' | 'Seasoned' | 'Tough' | 'Cooldown' | 'Scout';
    keywordValue?: number; // For keywords like Scout X and Tough X
}

