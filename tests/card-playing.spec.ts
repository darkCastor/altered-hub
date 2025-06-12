import { test, expect } from '@playwright/test';

test.describe('Card Playing Mechanics - Rule 5.1', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');

		// Set up a test deck with various card types
		await page.click('text=Browse Cards');
		await page.waitForSelector('[data-testid="card-grid"]', { timeout: 10000 });
		await page.click('text=Create Deck');
		await page.fill('input[placeholder="Enter deck name"]', 'Card Play Test Deck');
		await page.selectOption('select', 'Standard');

		// Add diverse cards for testing
		const cards = page.locator('[data-testid="card-item"]');
		for (let i = 0; i < 40; i++) {
			await cards.nth(i).click();
		}

		await page.click('button:has-text("Save Deck")');
		await page.click('text=My Decks');
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });
	});

	test('Rule 5.1.2: Card Playing Process', async ({ page }) => {
		// Navigate to Afternoon phase when cards can be played
		await navigateToAfternoonTurn(page);

		const handCards = await page.locator('[data-testid="player-hand"] [data-testid="card"]');
		const initialHandCount = await handCards.count();

		if (initialHandCount > 0) {
			// Rule 5.1.2.a-f: Validation and Declaration of Intent
			const cardToPlay = handCards.first();
			await cardToPlay.click();

			// Card should be selected (Rule 5.1.2.g: Intent declared)
			expect(await cardToPlay.getAttribute('class')).toContain('selected');

			// Rule 5.1.2.h: Check if card can be played
			const manaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
			const availableMana = parseInt(manaDisplay?.split('/')[0] || '0');

			// Get card cost (if visible)
			const cardCost = await cardToPlay.locator('[data-testid="card-cost"]').textContent();
			const cost = parseInt(cardCost || '0');

			if (cost <= availableMana) {
				// Rule 5.1.2.i: Play the card
				const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
				await expeditionZone.click();

				await page.waitForTimeout(1000);

				// Verify card was played successfully
				const newHandCount = await handCards.count();
				expect(newHandCount).toBe(initialHandCount - 1);

				// Verify mana was spent
				const newManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
				const newAvailableMana = parseInt(newManaDisplay?.split('/')[0] || '0');
				expect(newAvailableMana).toBe(availableMana - cost);

				// Rule 5.1.2.j: Turn advances after playing card
				await page.waitForTimeout(1000);
				const turnIndicator = await page.locator('[data-testid="turn-indicator"]').textContent();
				expect(turnIndicator).toContain("OPPONENT'S TURN");
			}
		}
	});

	test('Rule 5.1.3: Character Card Placement', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		// Find a Character card in hand
		const characterCard = await findCardByType(page, 'Character');
		if (characterCard) {
			await characterCard.click();

			// Rule 5.1.3: Characters go to Expedition zone
			const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
			const initialExpeditionCount = await expeditionZone.locator('[data-testid="card"]').count();

			await expeditionZone.click();
			await page.waitForTimeout(1000);

			const finalExpeditionCount = await expeditionZone.locator('[data-testid="card"]').count();
			expect(finalExpeditionCount).toBe(initialExpeditionCount + 1);
		}
	});

	test('Rule 5.1.4: Permanent Card Placement', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		// Test Landmark Permanent
		const landmarkCard = await findCardByType(page, 'Landmark');
		if (landmarkCard) {
			await landmarkCard.click();

			// Landmark Permanents go to Landmark zone
			const landmarkZone = page.locator('[data-testid="landmark-zone"][data-owner="self"]');
			const initialLandmarkCount = await landmarkZone.locator('[data-testid="card"]').count();

			await landmarkZone.click();
			await page.waitForTimeout(1000);

			const finalLandmarkCount = await landmarkZone.locator('[data-testid="card"]').count();
			expect(finalLandmarkCount).toBe(initialLandmarkCount + 1);
		}

		// Test Expedition Permanent
		const expeditionPermanent = await findCardByType(page, 'Expedition Permanent');
		if (expeditionPermanent) {
			await expeditionPermanent.click();

			// Expedition Permanents go to Expedition zone
			const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
			const initialExpeditionCount = await expeditionZone.locator('[data-testid="card"]').count();

			await expeditionZone.click();
			await page.waitForTimeout(1000);

			const finalExpeditionCount = await expeditionZone.locator('[data-testid="card"]').count();
			expect(finalExpeditionCount).toBe(initialExpeditionCount + 1);
		}
	});

	test('Rule 5.1.5: Spell Card Resolution', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		// Find a Spell card in hand
		const spellCard = await findCardByType(page, 'Spell');
		if (spellCard) {
			const initialReserveCount = await page
				.locator('[data-testid="reserve-zone"] [data-testid="card"]')
				.count();

			await spellCard.click();

			// Spells should auto-play (no target selection needed)
			await page.waitForTimeout(2000);

			// Rule 5.2.4.b: Non-Fleeting spells go to Reserve after resolution
			const finalReserveCount = await page
				.locator('[data-testid="reserve-zone"] [data-testid="card"]')
				.count();
			expect(finalReserveCount).toBe(initialReserveCount + 1);
		}
	});

	test('Rule 5.1.6: Cost Payment Validation', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		// Test insufficient mana scenario
		const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
		const cardCount = await handCards.count();

		if (cardCount > 0) {
			// Try to find a high-cost card
			for (let i = 0; i < Math.min(cardCount, 5); i++) {
				const card = handCards.nth(i);
				const costElement = card.locator('[data-testid="card-cost"]');
				const costText = await costElement.textContent();
				const cost = parseInt(costText || '0');

				const manaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
				const availableMana = parseInt(manaDisplay?.split('/')[0] || '0');

				if (cost > availableMana) {
					// Try to play this card (should fail)
					await card.click();

					const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
					await expeditionZone.click();

					// Card should still be in hand (payment failed)
					await page.waitForTimeout(1000);
					expect(await card.isVisible()).toBe(true);

					// Error message should appear
					const errorMessage = page.locator('[data-testid="error-message"]');
					expect(await errorMessage.isVisible()).toBe(true);
					break;
				}
			}
		}
	});

	test('Rule 5.1.7: Targeting and Zone Validation', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
		const cardCount = await handCards.count();

		if (cardCount > 0) {
			const card = handCards.first();
			await card.click();

			// Test invalid zone targeting
			const wrongZone = page.locator('[data-testid="reserve-zone"]');
			await wrongZone.click();

			// Card should not be played to wrong zone
			await page.waitForTimeout(1000);
			expect(await card.isVisible()).toBe(true);

			// Try correct zone
			const correctZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
			await correctZone.click();

			// Card should be played successfully
			await page.waitForTimeout(1000);
			const newCardCount = await handCards.count();
			expect(newCardCount).toBe(cardCount - 1);
		}
	});

	test('Rule 7.4.1.b: Cooldown Spell Mechanics', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		// Find a spell with Cooldown keyword
		const cooldownSpell = await findCardWithKeyword(page, 'Cooldown');
		if (cooldownSpell) {
			await cooldownSpell.click();
			await page.waitForTimeout(2000);

			// Cooldown spells should enter Reserve exhausted
			const reserveCards = page.locator('[data-testid="reserve-zone"] [data-testid="card"]');
			const lastReserveCard = reserveCards.last();

			// Check if card has exhausted status
			const cardClasses = await lastReserveCard.getAttribute('class');
			expect(cardClasses).toContain('exhausted');
		}
	});

	test('Turn End After Card Play', async ({ page }) => {
		await navigateToAfternoonTurn(page);

		const initialTurn = await page.locator('[data-testid="turn-indicator"]').textContent();
		expect(initialTurn).toContain('YOUR TURN');

		// Play a card
		const handCard = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
		if (await handCard.isVisible()) {
			await handCard.click();

			const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
			await expeditionZone.click();

			// Wait for turn to advance
			await page.waitForTimeout(2000);

			const newTurn = await page.locator('[data-testid="turn-indicator"]').textContent();
			expect(newTurn).toContain("OPPONENT'S TURN");
		}
	});
});

// Helper functions
async function navigateToAfternoonTurn(page: import('@playwright/test').Page) {
	// Navigate to Afternoon phase when it's the player's turn
	while (true) {
		const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
		const turnText = await page.locator('[data-testid="turn-indicator"]').textContent();

		if (phaseText?.includes('Afternoon') && turnText?.includes('YOUR TURN')) {
			break;
		}

		if (phaseText?.includes('Morning')) {
			const expandButton = page.locator('button:has-text("Skip Expand")');
			if (await expandButton.isVisible()) {
				await expandButton.click();
			} else {
				await page.click('button:has-text("Advance Phase")');
			}
		} else if (turnText?.includes("OPPONENT'S TURN")) {
			await page.waitForTimeout(2000); // Wait for opponent turn
		} else {
			await page.click('button:has-text("Advance Phase")');
		}

		await page.waitForTimeout(1000);
	}
}

async function findCardByType(page: import('@playwright/test').Page, cardType: string) {
	const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
	const count = await handCards.count();

	for (let i = 0; i < count; i++) {
		const card = handCards.nth(i);
		const typeElement = card.locator('[data-testid="card-type"]');
		const typeText = await typeElement.textContent();

		if (typeText?.includes(cardType)) {
			return card;
		}
	}
	return null;
}

async function findCardWithKeyword(page: import('@playwright/test').Page, keyword: string) {
	const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
	const count = await handCards.count();

	for (let i = 0; i < count; i++) {
		const card = handCards.nth(i);
		const keywordElement = card.locator('[data-testid="card-keywords"]');
		const keywordText = await keywordElement.textContent();

		if (keywordText?.includes(keyword)) {
			return card;
		}
	}
	return null;
}
