import type { GameStateManager } from './GameStateManager';
import type { ICost } from './types/abilities';
import { StatusType } from './types/enums';
import type { IGameObject } from './types/objects';
import { isGameObject } from './types/objects';

export class CostProcessor {
	constructor(private gsm: GameStateManager) {}

	public canPay(playerId: string, cost: ICost, sourceObjectId?: string): boolean {
		// Mana Cost
		if (cost.mana && cost.mana > 0) {
			const player = this.gsm.getPlayer(playerId);
			if (!player) return false;

			const readyManaCount = player.zones.manaZone.getAll().filter((orb) => {
				if (!isGameObject(orb)) return false;
				return !orb.statuses.has(StatusType.Exhausted);
			}).length;

			if (readyManaCount < cost.mana) {
				console.log(
					`[Cost] Player ${playerId} cannot pay ${cost.mana} mana. Has ${readyManaCount} ready.`
				);
				return false;
			}
		}

		// Exhaust Self Cost
		if (cost.exhaustSelf) {
			if (!sourceObjectId) {
				console.error(`[Cost] exhaustSelf cost requires a sourceObjectId, but none was provided.`);
				return false;
			}
			const sourceObject = this.gsm.getObject(sourceObjectId);
			if (!sourceObject) {
				console.error(
					`[Cost] Could not find source object ${sourceObjectId} to check exhaustSelf cost.`
				);
				return false;
			}
			if (sourceObject.statuses.has(StatusType.Exhausted)) {
				console.log(
					`[Cost] Cannot pay exhaustSelf cost; object ${sourceObjectId} is already exhausted.`
				);
				return false;
			}
		}

		// Spend Counters Cost (Rule 2.5.h)
		if (cost.spendCounters) {
			if (!sourceObjectId) {
				console.error(
					`[Cost] spendCounters cost requires a sourceObjectId, but none was provided.`
				);
				return false;
			}
			const sourceObject = this.gsm.getObject(sourceObjectId);
			if (!sourceObject) {
				console.error(
					`[Cost] Could not find source object ${sourceObjectId} to check spendCounters cost.`
				);
				return false;
			}
			const currentCounters = sourceObject.counters.get(cost.spendCounters.type) || 0;
			if (currentCounters < cost.spendCounters.amount) {
				console.log(
					`[Cost] Cannot pay spendCounters cost; object ${sourceObjectId} has ${currentCounters} but needs ${cost.spendCounters.amount} of ${cost.spendCounters.type}.`
				);
				return false;
			}
		}

		return true;
	}

	public pay(playerId: string, cost: ICost, sourceObjectId?: string) {
		// Pay Mana
		if (cost.mana && cost.mana > 0) {
			const player = this.gsm.getPlayer(playerId);
			if (!player) throw new Error('Player not found for cost payment');

			const readyMana = player.zones.manaZone
				.getAll()
				.filter((orb) => isGameObject(orb) && !orb.statuses.has(StatusType.Exhausted));

			if (readyMana.length < cost.mana) {
				throw new Error(`Insufficient ready mana to pay cost for player ${playerId}.`);
			}

			for (let i = 0; i < cost.mana; i++) {
				const manaToExhaust = readyMana[i] as IGameObject;
				manaToExhaust.statuses.add(StatusType.Exhausted);
				console.log(`[Cost] Exhausted mana orb ${manaToExhaust.objectId}`);
			}
			this.gsm.eventBus.publish('manaSpent', { playerId, amount: cost.mana });
		}

		// Pay Exhaust Self
		if (cost.exhaustSelf) {
			if (!sourceObjectId) {
				throw new Error('Cannot pay exhaustSelf cost without a sourceObjectId.');
			}
			const sourceObject = this.gsm.getObject(sourceObjectId);
			if (!sourceObject) {
				throw new Error(`Could not find source object ${sourceObjectId} to pay exhaustSelf cost.`);
			}
			if (sourceObject.statuses.has(StatusType.Exhausted)) {
				throw new Error(
					`Cannot pay exhaustSelf cost; object ${sourceObjectId} is already exhausted.`
				);
			}
			sourceObject.statuses.add(StatusType.Exhausted);
			console.log(
				`[Cost] Exhausted object ${sourceObject.objectId} ('${sourceObject.name}') to pay a cost.`
			);
		}

		// Pay Spend Counters (Rule 2.5.h / 7.3.27)
		if (cost.spendCounters) {
			if (!sourceObjectId) {
				throw new Error('Cannot pay spendCounters cost without a sourceObjectId.');
			}
			const sourceObject = this.gsm.getObject(sourceObjectId);
			if (!sourceObject) {
				throw new Error(
					`Could not find source object ${sourceObjectId} to pay spendCounters cost.`
				);
			}
			const currentAmount = sourceObject.counters.get(cost.spendCounters.type) || 0;
			if (currentAmount < cost.spendCounters.amount) {
				throw new Error(`Insufficient counters to pay cost on ${sourceObjectId}.`);
			}
			const newAmount = currentAmount - cost.spendCounters.amount;
			if (newAmount > 0) {
				sourceObject.counters.set(cost.spendCounters.type, newAmount);
			} else {
				sourceObject.counters.delete(cost.spendCounters.type);
			}
			console.log(
				`[Cost] Spent ${cost.spendCounters.amount} ${cost.spendCounters.type} counter(s) from ${sourceObject.objectId}.`
			);
			this.gsm.eventBus.publish('countersSpent', {
				sourceId: sourceObject.objectId,
				type: cost.spendCounters.type,
				amount: cost.spendCounters.amount
			});
		}
	}
}
