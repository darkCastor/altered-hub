import type { IGameObject, ICardInstance } from './objects';
import type { GameStateManager } from '../GameStateManager';
import type { ZoneIdentifier } from './enums';

/**
 * Represents a modification to a card's play cost.
 * This interface is used by CardPlaySystem to calculate the final cost
 * and by RuleAdjudicator to generate these modifiers from abilities.
 */
export interface CostModifier {
  type: 'increase' | 'decrease' | 'set' | 'minimum' | 'maximum';
  value: number;
  /**
   * A function that determines if this cost modifier applies to a specific card being played.
   * @param card The card instance or game object being played.
   * @param gsm The game state manager, for accessing broader game state if needed.
   * @param playerId The ID of the player attempting to play the card.
   * @param fromZone The zone from which the card is being played.
   * @param sourceObject (Optional) The source object that generated this modifier, for context within appliesTo.
   * @returns True if the modifier applies, false otherwise.
   */
  appliesTo: (
    card: IGameObject | ICardInstance,
    gsm: GameStateManager,
    playerId: string,
    fromZone: ZoneIdentifier,
    sourceObject?: IGameObject
  ) => boolean;
  sourceObjectId?: string; // The ID of the object that created this modifier
}
