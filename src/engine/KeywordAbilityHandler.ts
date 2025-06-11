import type { IGameObject } from './types/objects';
import type { GameStateManager } from './GameStateManager';
import type { IZone } from './types/zones';
import { KeywordAbility, StatusType, CounterType, CardType } from './types/enums';
import { isGameObject } from './types/objects';

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
    public processKeywordOnEnterPlay(object: IGameObject, zone: IZone): void {
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
    public canTargetWithTough(object: IGameObject, controller: string, cost: any): boolean {
        const toughAbility = object.abilities.find(
            a => a.isKeyword && a.keyword === KeywordAbility.Tough
        );

        if (!toughAbility || object.controllerId === controller) {
            return true; // No Tough or same controller
        }

        const toughValue = toughAbility.keywordValue || 0;
        // TODO: Check if opponent can pay the additional cost
        // For now, return true (assuming they can pay)
        return true;
    }

    /**
     * Handles Cooldown keyword (Rule 7.4.1)
     * When a Spell with Cooldown goes to Reserve after resolution, it becomes exhausted
     */
    private handleCooldownLeavePlay(object: IGameObject, fromZone: IZone, toZone: IZone): void {
        if (object.type === 'Sort' && toZone.zoneType === 'Reserve') { // Spell going to Reserve
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
        // TODO: Implement Gigantic logic
        // This is complex as it affects how the object appears in both expeditions
        console.log(`[KeywordHandler] ${object.name} is Gigantic - present in both expeditions`);
    }

    /**
     * Handles Gigantic keyword leave play
     */
    private handleGiganticLeavePlay(object: IGameObject): void {
        // TODO: Implement Gigantic leave logic
        console.log(`[KeywordHandler] Gigantic ${object.name} leaves both expeditions`);
    }

    /**
     * Checks if expeditions can move (Defender keyword check)
     * Rule 7.4.2 - An expedition containing a Character with Defender cannot move forward
     */
    public checkDefenderRestrictions(playerId: string): { hero: boolean; companion: boolean } {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return { hero: true, companion: true };

        const expeditionChars = player.zones.expeditionZone.getAll().filter(
            e => isGameObject(e) && e.type === CardType.Character
        ) as IGameObject[];

        let defenderPresent = false;
        for (const char of expeditionChars) {
            if (char.currentCharacteristics.hasDefender === true) {
                defenderPresent = true;
                break;
            }
            // Fallback: check base abilities if characteristic not set
            // (e.g., if RuleAdjudicator hasn't run or missed it for some reason,
            // or for systems that might query this before full adjudication)
            if (char.abilities.some(ability => ability.keyword === KeywordAbility.Defender)) {
                defenderPresent = true;
                break;
            }
        }

        return {
            hero: !defenderPresent,      // If defender is present, hero movement is restricted (false)
            companion: !defenderPresent // Same for companion
        };
    }

    /**
     * Processes Scout keyword when playing from hand
     * Rule 7.4.5 - Can pay X as alternative cost and gains "Send me to Reserve" ability
     */
    public processScoutPlay(object: IGameObject, paidScoutCost: boolean): void {
        if (!paidScoutCost) return;

        const scoutAbility = object.abilities.find(
            a => a.isKeyword && a.keyword === KeywordAbility.Scout
        );

        if (scoutAbility) {
            // TODO: Add the "Send me to Reserve" quick action ability
            console.log(`[KeywordHandler] ${object.name} gains Scout quick action`);
        }
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
        return object.abilities.some(ability => 
            ability.keyword === KeywordAbility.Eternal // Removed isKeyword check for broader compatibility
        );
    }
}