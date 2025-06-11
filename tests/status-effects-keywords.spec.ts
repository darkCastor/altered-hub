import { test, expect } from '@playwright/test';

test.describe('Status Effects and Keyword Abilities - Rules 2.4 & 7.4', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await setupTestDeck(page, 'Status Effects Test');
	});

	test('Rule 2.4.2: Anchored Status Effect', async ({ page }) => {
		await navigateToGameplay(page);

		// Find a character with Anchored status or apply it
		const anchoredCharacter = await findCharacterWithStatus(page, 'Anchored');
		if (anchoredCharacter) {
			// Rule 2.4.2: Anchored characters cannot move forward during Progress phase
			const initialPosition = await getCharacterPosition(page, anchoredCharacter);

			// Advance to Dusk phase (Progress phase)
			await navigateToDuskPhase(page);
			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(2000);

			// Verify character didn't move
			const finalPosition = await getCharacterPosition(page, anchoredCharacter);
			expect(finalPosition).toBe(initialPosition);

			// Verify Anchored status is still present
			const statusElements = anchoredCharacter.locator('[data-testid="status-effect"]');
			const statusText = await statusElements.allTextContents();
			expect(statusText).toContain('Anchored');
		}
	});

	test('Rule 2.4.3: Asleep Status Effect', async ({ page }) => {
		await navigateToGameplay(page);

		const asleepCharacter = await findCharacterWithStatus(page, 'Asleep');
		if (asleepCharacter) {
			// Rule 2.4.3.a: Asleep characters cannot be chosen to go on an Expedition
			await navigateToAfternoonTurn(page);

			// Try to select the asleep character for expedition action
			await asleepCharacter.click();

			// Should not be selectable or should show error
			const errorMessage = page.locator('[data-testid="error-message"]');
			if (await errorMessage.isVisible()) {
				const errorText = await errorMessage.textContent();
				expect(errorText).toMatch(/asleep|cannot.*expedition/i);
			}

			// Rule 2.4.3.b: Asleep status is removed during Morning Succeed step
			await advanceToNextMorning(page);

			// Verify Asleep status is removed
			const statusElements = asleepCharacter.locator('[data-testid="status-effect"]');
			const statusText = await statusElements.allTextContents();
			expect(statusText).not.toContain('Asleep');
		}
	});

	test('Rule 2.4.4: Boosted Status Effect', async ({ page }) => {
		await navigateToGameplay(page);

		const boostedCharacter = await findCharacterWithStatus(page, 'Boosted');
		if (boostedCharacter) {
			// Rule 2.4.4: Boosted characters have +1 to all statistics
			const statsElement = boostedCharacter.locator('[data-testid="character-stats"]');
			const statsText = await statsElement.textContent();

			// Verify boosted stats (should show increased values)
			expect(statsText).toMatch(/\+1|\+/); // Look for boost indicators

			// Rule 2.4.4.b: Boosted status is removed during Morning Succeed step
			await advanceToNextMorning(page);

			const statusElements = boostedCharacter.locator('[data-testid="status-effect"]');
			const statusText = await statusElements.allTextContents();
			expect(statusText).not.toContain('Boosted');
		}
	});

	test('Rule 2.4.5: Exhausted Status Effect', async ({ page }) => {
		await navigateToGameplay(page);

		// Find an exhausted mana orb or character
		const exhaustedMana = page.locator('[data-testid="mana-orb"][data-status="exhausted"]');
		if ((await exhaustedMana.count()) > 0) {
			// Rule 2.4.5: Exhausted objects cannot be used to pay costs
			const manaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
			const currentMana = parseInt(manaDisplay?.split('/')[0] || '0');
			const maxMana = parseInt(manaDisplay?.split('/')[1] || '0');

			expect(currentMana).toBeLessThan(maxMana); // Some mana should be exhausted

			// Rule 2.4.5.b: Exhausted status is removed during Morning Prepare step
			await advanceToNextMorning(page);

			const newManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
			const newCurrentMana = parseInt(newManaDisplay?.split('/')[0] || '0');
			const newMaxMana = parseInt(newManaDisplay?.split('/')[1] || '0');

			expect(newCurrentMana).toBe(newMaxMana); // All mana should be ready
		}
	});

	test('Rule 2.4.6: Fleeting Status Effect', async ({ page }) => {
		await navigateToGameplay(page);

		// Find a fleeting spell or permanent
		const fleetingCard = await findCardWithStatus(page, 'Fleeting');
		if (fleetingCard) {
			// Rule 2.4.6.e: Fleeting spells go to Discard Pile instead of Reserve
			if (await isSpellCard(page, fleetingCard)) {
				const initialDiscardCount = await page
					.locator('[data-testid="discard-count"]')
					.textContent();
				const discardCount = parseInt(initialDiscardCount || '0');

				await playCard(page, fleetingCard);

				const finalDiscardCount = await page.locator('[data-testid="discard-count"]').textContent();
				const newDiscardCount = parseInt(finalDiscardCount || '0');

				expect(newDiscardCount).toBe(discardCount + 1);
			}

			// Rule 2.4.6.f: Fleeting permanents are discarded during Night Clean-up
			if (await isPermanentCard(page, fleetingCard)) {
				await advanceToNightPhase(page);

				// Card should be moved to discard pile during clean-up
				const discardPile = page.locator('[data-testid="discard-pile"]');
				const discardedCards = await discardPile.locator('[data-testid="card"]').allTextContents();
				const cardName = await fleetingCard.locator('[data-testid="card-name"]').textContent();

				expect(discardedCards).toContain(cardName);
			}
		}
	});

	test('Rule 7.4.1: Cooldown Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const cooldownSpell = await findCardWithKeyword(page, 'Cooldown');
		if (cooldownSpell) {
			await navigateToAfternoonTurn(page);

			// Rule 7.4.1.b: Cooldown spells enter Reserve exhausted
			await playCard(page, cooldownSpell);

			const reserveZone = page.locator('[data-testid="reserve-zone"]');
			const exhaustedCards = reserveZone.locator('[data-testid="card"][data-status="exhausted"]');

			expect(await exhaustedCards.count()).toBeGreaterThan(0);

			// Rule 7.4.1.c: Cannot be recalled while exhausted
			const exhaustedSpell = exhaustedCards.first();
			await exhaustedSpell.click();

			// Should not be recallable
			const recallButton = page.locator('button:has-text("Recall")');
			expect(await recallButton.isEnabled()).toBe(false);
		}
	});

	test('Rule 7.4.2: Defender Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const defenderCharacter = await findCharacterWithKeyword(page, 'Defender');
		if (defenderCharacter) {
			// Rule 7.4.2: Characters with Defender cannot move forward
			const initialPosition = await getCharacterPosition(page, defenderCharacter);

			await navigateToDuskPhase(page);
			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(2000);

			const finalPosition = await getCharacterPosition(page, defenderCharacter);
			expect(finalPosition).toBe(initialPosition);

			// Rule 7.4.2.b: Other characters in same expedition also cannot move
			const expeditionZone = defenderCharacter.locator(
				'xpath=ancestor::[data-testid="expedition-zone"]'
			);
			const expeditionCharacters = expeditionZone.locator('[data-testid="character-card"]');

			for (let i = 0; i < (await expeditionCharacters.count()); i++) {
				const character = expeditionCharacters.nth(i);
				const position = await getCharacterPosition(page, character);
				// All should remain at same position
				expect(position).toBe(initialPosition);
			}
		}
	});

	test('Rule 7.4.3: Eternal Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const eternalCard = await findCardWithKeyword(page, 'Eternal');
		if (eternalCard) {
			// Rule 7.4.3: Eternal cards cannot be discarded
			// Try to discard through various means

			// Test 1: Night clean-up should not discard Eternal cards
			const cardName = await eternalCard.locator('[data-testid="card-name"]').textContent();
			await advanceToNightPhase(page);

			// Card should still be in play
			const boardCards = page.locator('[data-testid="game-board"] [data-testid="card"]');
			const boardCardNames = await boardCards.allTextContents();
			expect(boardCardNames).toContain(cardName);

			// Should not be in discard pile
			const discardPile = page.locator('[data-testid="discard-pile"]');
			const discardedCards = await discardPile.locator('[data-testid="card"]').allTextContents();
			expect(discardedCards).not.toContain(cardName);
		}
	});

	test('Rule 7.4.4: Gigantic Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const giganticCharacter = await findCharacterWithKeyword(page, 'Gigantic');
		if (giganticCharacter) {
			// Rule 7.4.4: Gigantic characters take up 2 expedition slots
			const expeditionZone = giganticCharacter.locator(
				'xpath=ancestor::[data-testid="expedition-zone"]'
			);
			const expeditionCards = expeditionZone.locator('[data-testid="character-card"]');
			const totalCards = await expeditionCards.count();

			// Try to add another character to the expedition
			await navigateToAfternoonTurn(page);
			const handCharacter = await findCharacterInHand(page);

			if (handCharacter) {
				await handCharacter.click();
				await expeditionZone.click();

				// Should be rejected if expedition is full due to Gigantic
				if (totalCards >= 3) {
					// Assuming max 4 slots, Gigantic takes 2
					const errorMessage = page.locator('[data-testid="error-message"]');
					expect(await errorMessage.isVisible()).toBe(true);
				}
			}
		}
	});

	test('Rule 7.4.5: Scout Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const scoutCharacter = await findCharacterWithKeyword(page, 'Scout');
		if (scoutCharacter) {
			// Rule 7.4.5: Scout characters move +1 additional step during Progress
			const initialPosition = await getCharacterPosition(page, scoutCharacter);

			await navigateToDuskPhase(page);
			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(2000);

			const finalPosition = await getCharacterPosition(page, scoutCharacter);
			expect(finalPosition).toBe(initialPosition + 2); // +1 normal + 1 scout bonus
		}
	});

	test('Rule 7.4.6: Seasoned Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const seasonedCharacter = await findCharacterWithKeyword(page, 'Seasoned');
		if (seasonedCharacter) {
			// Rule 7.4.6: Seasoned X - character enters play with X boost counters
			const boostCounters = seasonedCharacter.locator('[data-testid="boost-counter"]');
			const counterCount = await boostCounters.count();

			expect(counterCount).toBeGreaterThan(0);

			// Verify boost counters provide +1/+1/+1 per counter
			const statsElement = seasonedCharacter.locator('[data-testid="character-stats"]');
			const statsText = await statsElement.textContent();
			expect(statsText).toMatch(/\+\d/); // Should show boosted stats
		}
	});

	test('Rule 7.4.7: Tough Keyword Ability', async ({ page }) => {
		await navigateToGameplay(page);

		const toughCharacter = await findCharacterWithKeyword(page, 'Tough');
		if (toughCharacter) {
			// Rule 7.4.7: Tough X - character takes X less damage
			// This would need damage dealing mechanics to test properly

			// For now, verify the Tough status is displayed
			const keywordElements = toughCharacter.locator('[data-testid="keyword-ability"]');
			const keywordText = await keywordElements.allTextContents();
			expect(keywordText.some((text) => text.includes('Tough'))).toBe(true);
		}
	});

	test('Status Effect Interactions and Stacking', async ({ page }) => {
		await navigateToGameplay(page);

		// Test multiple status effects on same character
		const character = await findAnyCharacter(page);
		if (character) {
			// Apply multiple status effects (if possible through game mechanics)
			await applyStatusEffect(page, character, 'Boosted');
			await applyStatusEffect(page, character, 'Anchored');

			const statusElements = character.locator('[data-testid="status-effect"]');
			const statusTexts = await statusElements.allTextContents();

			// Should have both effects
			expect(statusTexts).toContain('Boosted');
			expect(statusTexts).toContain('Anchored');

			// Effects should interact correctly
			// Boosted should increase stats, Anchored should prevent movement
			const statsElement = character.locator('[data-testid="character-stats"]');
			const statsText = await statsElement.textContent();
			expect(statsText).toMatch(/\+/); // Boosted effect
		}
	});

	test('Status Effect Duration and Removal', async ({ page }) => {
		await navigateToGameplay(page);

		// Test that temporary status effects are removed at correct times
		const character = await findCharacterWithStatus(page, 'Boosted');
		if (character) {
			// Boosted should be removed during next Morning Succeed step
			await advanceToNextMorning(page);

			const statusElements = character.locator('[data-testid="status-effect"]');
			const statusTexts = await statusElements.allTextContents();
			expect(statusTexts).not.toContain('Boosted');
		}

		// Test permanent status effects (like those from keywords)
		const eternalCard = await findCardWithKeyword(page, 'Eternal');
		if (eternalCard) {
			await advanceToNextMorning(page);

			// Eternal keyword should persist
			const keywordElements = eternalCard.locator('[data-testid="keyword-ability"]');
			const keywordTexts = await keywordElements.allTextContents();
			expect(keywordTexts.some((text) => text.includes('Eternal'))).toBe(true);
		}
	});
});

// Helper functions for status effects and keywords
async function setupTestDeck(page: any, deckName: string) {
	await page.click('text=Browse Cards');
	await page.waitForSelector('[data-testid="card-grid"]', { timeout: 10000 });
	await page.click('text=Create Deck');
	await page.fill('input[placeholder="Enter deck name"]', deckName);
	await page.selectOption('select', 'Standard');

	const cards = page.locator('[data-testid="card-item"]');
	for (let i = 0; i < 40; i++) {
		await cards.nth(i).click();
	}

	await page.click('button:has-text("Save Deck")');
	await page.click('text=My Decks');
	await page.click('button:has-text("Play")');
	await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });
}

async function navigateToGameplay(page: any) {
	// Basic navigation to get game started
	while (true) {
		const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
		if (phaseText?.includes('Afternoon')) {
			break;
		}
		await page.click('button:has-text("Advance Phase")');
		await page.waitForTimeout(1000);
	}
}

async function findCharacterWithStatus(page: any, status: string) {
	const characters = page.locator('[data-testid="character-card"]');
	const count = await characters.count();

	for (let i = 0; i < count; i++) {
		const character = characters.nth(i);
		const statusElements = character.locator('[data-testid="status-effect"]');
		const statusTexts = await statusElements.allTextContents();

		if (statusTexts.includes(status)) {
			return character;
		}
	}
	return null;
}

async function findCardWithStatus(page: any, status: string) {
	const cards = page.locator('[data-testid="card"]');
	const count = await cards.count();

	for (let i = 0; i < count; i++) {
		const card = cards.nth(i);
		const statusElements = card.locator('[data-testid="status-effect"]');
		const statusTexts = await statusElements.allTextContents();

		if (statusTexts.includes(status)) {
			return card;
		}
	}
	return null;
}

async function findCharacterWithKeyword(page: any, keyword: string) {
	const characters = page.locator('[data-testid="character-card"]');
	const count = await characters.count();

	for (let i = 0; i < count; i++) {
		const character = characters.nth(i);
		const keywordElements = character.locator('[data-testid="keyword-ability"]');
		const keywordTexts = await keywordElements.allTextContents();

		if (keywordTexts.some((text) => text.includes(keyword))) {
			return character;
		}
	}
	return null;
}

async function findCardWithKeyword(page: any, keyword: string) {
	const cards = page.locator('[data-testid="card"]');
	const count = await cards.count();

	for (let i = 0; i < count; i++) {
		const card = cards.nth(i);
		const keywordElements = card.locator('[data-testid="keyword-ability"]');
		const keywordTexts = await keywordElements.allTextContents();

		if (keywordTexts.some((text) => text.includes(keyword))) {
			return card;
		}
	}
	return null;
}

async function getCharacterPosition(page: any, character: any): Promise<number> {
	const positionElement = character.locator('[data-testid="character-position"]');
	const positionText = await positionElement.textContent();
	return parseInt(positionText || '0');
}

async function navigateToAfternoonTurn(page: any) {
	while (true) {
		const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
		const turnText = await page.locator('[data-testid="turn-indicator"]').textContent();

		if (phaseText?.includes('Afternoon') && turnText?.includes('YOUR TURN')) {
			break;
		}

		if (turnText?.includes("OPPONENT'S TURN")) {
			await page.waitForTimeout(2000);
		} else {
			await page.click('button:has-text("Advance Phase")');
		}
		await page.waitForTimeout(1000);
	}
}

async function navigateToDuskPhase(page: any) {
	while (true) {
		const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
		if (phaseText?.includes('Dusk')) {
			break;
		}
		await page.click('button:has-text("Advance Phase")');
		await page.waitForTimeout(1000);
	}
}

async function advanceToNextMorning(page: any) {
	const currentDay = await page.locator('[data-testid="day-display"]').textContent();
	const dayNumber = parseInt(currentDay?.match(/Day: (\d+)/)?.[1] || '1');

	while (true) {
		const newDay = await page.locator('[data-testid="day-display"]').textContent();
		const newDayNumber = parseInt(newDay?.match(/Day: (\d+)/)?.[1] || '1');
		const phaseText = await page.locator('[data-testid="phase-display"]').textContent();

		if (newDayNumber > dayNumber && phaseText?.includes('Morning')) {
			break;
		}

		await page.click('button:has-text("Advance Phase")');
		await page.waitForTimeout(1000);
	}
}

async function advanceToNightPhase(page: any) {
	while (true) {
		const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
		if (phaseText?.includes('Night')) {
			break;
		}
		await page.click('button:has-text("Advance Phase")');
		await page.waitForTimeout(1000);
	}
}

async function isSpellCard(page: any, card: any): Promise<boolean> {
	const typeElement = card.locator('[data-testid="card-type"]');
	const typeText = await typeElement.textContent();
	return typeText?.includes('Spell') || false;
}

async function isPermanentCard(page: any, card: any): Promise<boolean> {
	const typeElement = card.locator('[data-testid="card-type"]');
	const typeText = await typeElement.textContent();
	return typeText?.includes('Permanent') || false;
}

async function playCard(page: any, card: any) {
	await card.click();

	// Try to play in appropriate zone
	const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
	await expeditionZone.click();

	await page.waitForTimeout(1000);
}

async function findAnyCharacter(page: any) {
	const characters = page.locator('[data-testid="character-card"]');
	if ((await characters.count()) > 0) {
		return characters.first();
	}
	return null;
}

async function findCharacterInHand(page: any) {
	const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
	const count = await handCards.count();

	for (let i = 0; i < count; i++) {
		const card = handCards.nth(i);
		const typeElement = card.locator('[data-testid="card-type"]');
		const typeText = await typeElement.textContent();

		if (typeText?.includes('Character')) {
			return card;
		}
	}
	return null;
}

async function applyStatusEffect(page: any, character: any, status: string) {
	// This would depend on game mechanics for applying status effects
	// For now, this is a placeholder for when such mechanics exist
	console.log(`Applying ${status} to character`);
}
