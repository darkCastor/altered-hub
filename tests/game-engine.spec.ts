import { test, expect } from '@playwright/test';

test.describe('Altered TCG Game Engine - Rules Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');

		// Navigate to create a deck first if needed
		await page.click('text=Browse Cards');

		// Wait for cards to load
		await page.waitForSelector('[data-testid="card-grid"]', { timeout: 10000 });

		// Create a basic deck for testing
		await page.click('text=Create Deck');
		await page.fill('input[placeholder="Enter deck name"]', 'Test Deck');
		await page.selectOption('select', 'Standard');

		// Add some cards to the deck (click first few cards)
		const cards = page.locator('[data-testid="card-item"]').first();
		await cards.click();

		// Save the deck
		await page.click('button:has-text("Save Deck")');

		// Navigate to decks page
		await page.click('text=My Decks');
	});

	test('Rule 4.1: Game Setup Phase', async ({ page }) => {
		// Start a game with our test deck
		await page.click('button:has-text("Play")');

		// Wait for game to initialize
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// Verify initial game state according to Rule 4.1
		// Rule 4.1.a: Each player starts with a deck of cards
		const deckCount = await page.locator('[data-testid="deck-count"]').textContent();
		expect(parseInt(deckCount || '0')).toBeGreaterThan(0);

		// Rule 4.1.b: Each player draws an opening hand
		const handCards = await page
			.locator('[data-testid="player-hand"] [data-testid="card"]')
			.count();
		expect(handCards).toBe(6); // Starting hand size according to rules

		// Rule 4.1.c: Each player starts with 3 Mana Orbs
		const manaText = await page.locator('[data-testid="mana-display"]').textContent();
		expect(manaText).toContain('3/3'); // current/max mana

		// Rule 4.1.d: Game starts on Day 1
		const dayDisplay = await page.locator('[data-testid="day-display"]').textContent();
		expect(dayDisplay).toContain('Day: 1');

		// Rule 4.1.e: First phase should be Morning (but skipped on Day 1)
		const phaseDisplay = await page.locator('[data-testid="phase-display"]').textContent();
		expect(phaseDisplay).toMatch(/Phase: (Morning|Noon)/);
	});

	test('Rule 4.2.1: Morning Phase Mechanics', async ({ page }) => {
		// Start game and advance to Day 2 to test Morning phase
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// Advance through Day 1 phases to reach Day 2 Morning
		while (true) {
			const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
			const dayText = await page.locator('[data-testid="day-display"]').textContent();

			if (dayText?.includes('Day: 2') && phaseText?.includes('Morning')) {
				break;
			}

			// Advance phase
			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(1000);
		}

		// Rule 4.2.1.c: Players draw 2 cards during Morning
		const initialHandCount = await page
			.locator('[data-testid="player-hand"] [data-testid="card"]')
			.count();

		// Wait for draw to complete (automatic in Morning)
		await page.waitForTimeout(2000);

		const finalHandCount = await page
			.locator('[data-testid="player-hand"] [data-testid="card"]')
			.count();
		expect(finalHandCount).toBe(initialHandCount + 2);

		// Rule 4.2.1.e: Expand phase should be available
		const expandButton = await page.locator('button:has-text("Expand Card")');
		expect(await expandButton.isVisible()).toBe(true);
	});

	test('Rule 4.2.1.e: Expand Mechanics', async ({ page }) => {
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// Navigate to a Morning phase where expand is available
		while (true) {
			const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
			const expandButton = page.locator('button:has-text("Expand Card")');

			if (phaseText?.includes('Morning') && (await expandButton.isVisible())) {
				break;
			}

			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(1000);
		}

		// Test expand functionality
		const initialHandCount = await page
			.locator('[data-testid="player-hand"] [data-testid="card"]')
			.count();
		const initialManaCount = await page.locator('[data-testid="mana-display"]').textContent();

		// Click expand
		await page.click('button:has-text("Expand Card")');

		// Select a card to expand
		const handCard = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
		await handCard.click();

		// Verify card moved from hand to mana
		await page.waitForTimeout(1000);
		const finalHandCount = await page
			.locator('[data-testid="player-hand"] [data-testid="card"]')
			.count();
		expect(finalHandCount).toBe(initialHandCount - 1);

		// Verify mana increased
		const finalManaText = await page.locator('[data-testid="mana-display"]').textContent();
		const finalManaMax = parseInt(finalManaText?.split('/')[1] || '0');
		const initialManaMax = parseInt(initialManaCount?.split('/')[1] || '0');
		expect(finalManaMax).toBe(initialManaMax + 1);

		// Test skip expand
		await page.click('button:has-text("Skip Expand")');

		// Verify expand option is no longer available
		const expandButtonAfter = page.locator('button:has-text("Expand Card")');
		expect(await expandButtonAfter.isVisible()).toBe(false);
	});

	test('Rule 4.2.2: Noon Phase Transition', async ({ page }) => {
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// Navigate to Noon phase
		while (true) {
			const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
			if (phaseText?.includes('Noon')) {
				break;
			}
			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(1000);
		}

		// Rule 4.2.2: Noon automatically transitions to Afternoon
		await page.click('button:has-text("Advance Phase")');
		await page.waitForTimeout(1000);

		const phaseAfterNoon = await page.locator('[data-testid="phase-display"]').textContent();
		expect(phaseAfterNoon).toContain('Afternoon');
	});

	test('Rule 4.2.3: Afternoon Phase Turn Mechanics', async ({ page }) => {
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// Navigate to Afternoon phase
		while (true) {
			const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
			if (phaseText?.includes('Afternoon')) {
				break;
			}
			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(1000);
		}

		// Rule 4.2.3: Players take turns during Afternoon
		const turnIndicator = await page.locator('[data-testid="turn-indicator"]').textContent();
		expect(turnIndicator).toMatch(/(YOUR TURN|OPPONENT'S TURN)/);

		// Test pass turn functionality
		if (turnIndicator?.includes('YOUR TURN')) {
			const passButton = page.locator('button:has-text("Pass Turn")');
			expect(await passButton.isEnabled()).toBe(true);

			await passButton.click();
			await page.waitForTimeout(1000);

			// Turn should advance to opponent
			const newTurnIndicator = await page.locator('[data-testid="turn-indicator"]').textContent();
			expect(newTurnIndicator).toContain("OPPONENT'S TURN");
		}
	});

	test('Rule 5.1: Card Playing Mechanics', async ({ page }) => {
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// Navigate to Afternoon phase (when cards can be played)
		while (true) {
			const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
			const turnText = await page.locator('[data-testid="turn-indicator"]').textContent();

			if (phaseText?.includes('Afternoon') && turnText?.includes('YOUR TURN')) {
				break;
			}

			await page.click('button:has-text("Advance Phase")');
			await page.waitForTimeout(1000);
		}

		// Test playing a card
		const handCards = await page
			.locator('[data-testid="player-hand"] [data-testid="card"]')
			.count();
		if (handCards > 0) {
			// Click on a card in hand
			const cardToPlay = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
			await cardToPlay.click();

			// Card should be selected for play
			expect(await cardToPlay.getAttribute('class')).toContain('selected');

			// Try to play it in expedition zone
			const expeditionZone = page.locator('[data-testid="expedition-zone"]');
			await expeditionZone.click();

			// Verify card was played (hand count decreased)
			await page.waitForTimeout(1000);
			const newHandCount = await page
				.locator('[data-testid="player-hand"] [data-testid="card"]')
				.count();
			expect(newHandCount).toBe(handCards - 1);
		}
	});

	test('Rule 7.5: Victory Conditions', async ({ page }) => {
		await page.click('button:has-text("Play")');
		await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });

		// This test verifies the victory condition checking logic
		// Rule 7.5.1: A player wins when their Hero or Companion reaches the opposing region

		// Navigate through multiple days to test victory checking
		for (let day = 1; day <= 3; day++) {
			while (true) {
				const dayText = await page.locator('[data-testid="day-display"]').textContent();
				if (dayText?.includes(`Day: ${day + 1}`)) {
					break;
				}

				await page.click('button:has-text("Advance Phase")');
				await page.waitForTimeout(500);

				// Check if game ended due to victory
				const gameEndedModal = page.locator('[data-testid="game-ended-modal"]');
				if (await gameEndedModal.isVisible()) {
					const victoryText = await gameEndedModal.textContent();
					expect(victoryText).toMatch(/(Victory|Defeat|Winner)/);
					return; // Test passed - victory condition triggered
				}
			}
		}

		// If we reach here, no victory condition was met in 3 days (normal)
		const dayText = await page.locator('[data-testid="day-display"]').textContent();
		expect(dayText).toContain('Day: 4');
	});
});
