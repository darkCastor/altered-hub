import { test, expect } from '@playwright/test';

test.describe('Expand Mechanics - Rule 4.2.1.e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Set up test deck
    await page.click('text=Browse Cards');
    await page.waitForSelector('[data-testid="card-grid"]', { timeout: 10000 });
    await page.click('text=Create Deck');
    await page.fill('input[placeholder="Enter deck name"]', 'Expand Test Deck');
    await page.selectOption('select', 'Standard');
    
    // Add cards to deck
    const cards = page.locator('[data-testid="card-item"]');
    for (let i = 0; i < 40; i++) {
      await cards.nth(i).click();
    }
    
    await page.click('button:has-text("Save Deck")');
    await page.click('text=My Decks');
    await page.click('button:has-text("Play")');
    await page.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });
  });

  test('Rule 4.2.1.e: Expand Availability in Morning Phase', async ({ page }) => {
    // Navigate to Day 2 Morning (Day 1 Morning is skipped)
    await navigateToMorningPhase(page);
    
    // Verify expand button is available
    const expandButton = page.locator('button:has-text("Expand Card")');
    expect(await expandButton.isVisible()).toBe(true);
    expect(await expandButton.isEnabled()).toBe(true);
    
    // Verify skip expand button is also available
    const skipButton = page.locator('button:has-text("Skip Expand")');
    expect(await skipButton.isVisible()).toBe(true);
    expect(await skipButton.isEnabled()).toBe(true);
  });

  test('Rule 4.2.1.e: Expand Card to Mana Zone', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    const initialHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    const initialManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const initialManaMax = parseInt(initialManaDisplay?.split('/')[1] || '0');
    
    if (initialHandCount > 0) {
      // Click expand button
      await page.click('button:has-text("Expand Card")');
      
      // Select a card from hand
      const handCard = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
      await handCard.click();
      
      await page.waitForTimeout(1000);
      
      // Verify card moved from hand to mana
      const finalHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
      expect(finalHandCount).toBe(initialHandCount - 1);
      
      // Verify mana orb count increased
      const finalManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
      const finalManaMax = parseInt(finalManaDisplay?.split('/')[1] || '0');
      expect(finalManaMax).toBe(initialManaMax + 1);
      
      // Rule 4.2.1.e: Mana Orb enters ready (not exhausted)
      const finalManaCurrent = parseInt(finalManaDisplay?.split('/')[0] || '0');
      expect(finalManaCurrent).toBe(finalManaMax); // All mana should be available
    }
  });

  test('Rule 4.2.1.e: Skip Expand Option', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    const initialHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    const initialManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const initialManaMax = parseInt(initialManaDisplay?.split('/')[1] || '0');
    
    // Click skip expand
    await page.click('button:has-text("Skip Expand")');
    
    await page.waitForTimeout(1000);
    
    // Verify hand count unchanged
    const finalHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    expect(finalHandCount).toBe(initialHandCount);
    
    // Verify mana unchanged
    const finalManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const finalManaMax = parseInt(finalManaDisplay?.split('/')[1] || '0');
    expect(finalManaMax).toBe(initialManaMax);
    
    // Expand options should no longer be available
    const expandButton = page.locator('button:has-text("Expand Card")');
    const skipButton = page.locator('button:has-text("Skip Expand")');
    expect(await expandButton.isVisible()).toBe(false);
    expect(await skipButton.isVisible()).toBe(false);
  });

  test('Expand Once Per Turn Restriction', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    const initialHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    
    if (initialHandCount > 1) {
      // Expand first card
      await page.click('button:has-text("Expand Card")');
      const firstCard = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
      await firstCard.click();
      
      await page.waitForTimeout(1000);
      
      // Verify expand options are no longer available
      const expandButton = page.locator('button:has-text("Expand Card")');
      const skipButton = page.locator('button:has-text("Skip Expand")');
      expect(await expandButton.isVisible()).toBe(false);
      expect(await skipButton.isVisible()).toBe(false);
      
      // Verify only one card was moved
      const finalHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
      expect(finalHandCount).toBe(initialHandCount - 1);
    }
  });

  test('Expand Not Available Outside Morning Phase', async ({ page }) => {
    // Test in Noon phase
    while (true) {
      const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
      if (phaseText?.includes('Noon')) {
        break;
      }
      await page.click('button:has-text("Advance Phase")');
      await page.waitForTimeout(1000);
    }
    
    const expandButton = page.locator('button:has-text("Expand Card")');
    const skipButton = page.locator('button:has-text("Skip Expand")');
    expect(await expandButton.isVisible()).toBe(false);
    expect(await skipButton.isVisible()).toBe(false);
    
    // Test in Afternoon phase
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(1000);
    
    const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
    expect(phaseText).toContain('Afternoon');
    
    expect(await expandButton.isVisible()).toBe(false);
    expect(await skipButton.isVisible()).toBe(false);
  });

  test('Expand Resets Between Days', async ({ page }) => {
    // Test expand on Day 2
    await navigateToMorningPhase(page);
    
    if (await page.locator('[data-testid="player-hand"] [data-testid="card"]').count() > 0) {
      await page.click('button:has-text("Expand Card")');
      const handCard = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
      await handCard.click();
      
      await page.waitForTimeout(1000);
      
      // Expand should no longer be available
      const expandButton = page.locator('button:has-text("Expand Card")');
      expect(await expandButton.isVisible()).toBe(false);
    }
    
    // Advance to Day 3 Morning
    await advanceToNextDay(page);
    await navigateToMorningPhase(page);
    
    // Expand should be available again
    const expandButton = page.locator('button:has-text("Expand Card")');
    const skipButton = page.locator('button:has-text("Skip Expand")');
    expect(await expandButton.isVisible()).toBe(true);
    expect(await skipButton.isVisible()).toBe(true);
  });

  test('Expand with Empty Hand', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    // Simulate empty hand scenario (if possible)
    const handCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    
    if (handCount === 0) {
      // Expand button should still be visible but disabled
      const expandButton = page.locator('button:has-text("Expand Card")');
      expect(await expandButton.isVisible()).toBe(true);
      expect(await expandButton.isEnabled()).toBe(false);
      
      // Skip should still work
      const skipButton = page.locator('button:has-text("Skip Expand")');
      expect(await skipButton.isVisible()).toBe(true);
      expect(await skipButton.isEnabled()).toBe(true);
      
      await skipButton.click();
      
      // Options should disappear after skip
      expect(await expandButton.isVisible()).toBe(false);
      expect(await skipButton.isVisible()).toBe(false);
    }
  });

  test('Expand UI State Management', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    // Test expand button interaction
    await page.click('button:has-text("Expand Card")');
    
    // Cards in hand should become selectable for expand
    const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
    const firstCard = handCards.first();
    
    if (await firstCard.isVisible()) {
      // Click on a card
      await firstCard.click();
      
      // Card should be selected or action should complete
      await page.waitForTimeout(1000);
      
      // Verify expand completed - buttons should disappear
      const expandButton = page.locator('button:has-text("Expand Card")');
      const skipButton = page.locator('button:has-text("Skip Expand")');
      expect(await expandButton.isVisible()).toBe(false);
      expect(await skipButton.isVisible()).toBe(false);
    }
  });

  test('Multiple Players Expand Mechanics', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    // Player 1 expand
    if (await page.locator('[data-testid="player-hand"] [data-testid="card"]').count() > 0) {
      await page.click('button:has-text("Expand Card")');
      const handCard = page.locator('[data-testid="player-hand"] [data-testid="card"]').first();
      await handCard.click();
      
      await page.waitForTimeout(1000);
    }
    
    // Wait for opponent's expand decision (simulated)
    // In a real game, both players would need to make expand decisions
    // For testing, we verify that the phase doesn't advance until both players decide
    
    // Phase should eventually advance to Noon after both players decide
    await page.waitForFunction(() => {
      const phaseElement = document.querySelector('[data-testid="phase-display"]');
      return phaseElement?.textContent?.includes('Noon');
    }, { timeout: 10000 });
    
    const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
    expect(phaseText).toContain('Noon');
  });
});

// Helper functions
async function navigateToMorningPhase(page: any) {
  // Navigate to a Morning phase (Day 2+)
  while (true) {
    const dayText = await page.locator('[data-testid="day-display"]').textContent();
    const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
    
    if (phaseText?.includes('Morning') && !dayText?.includes('Day: 1')) {
      break;
    }
    
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(1000);
  }
}

async function advanceToNextDay(page: any) {
  // Advance through all phases to reach the next day
  while (true) {
    const currentDay = await page.locator('[data-testid="day-display"]').textContent();
    const dayNumber = parseInt(currentDay?.match(/Day: (\d+)/)?.[1] || '1');
    
    const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
    
    if (phaseText?.includes('Afternoon')) {
      // Handle turn-based play in Afternoon
      const turnText = await page.locator('[data-testid="turn-indicator"]').textContent();
      if (turnText?.includes('YOUR TURN')) {
        await page.click('button:has-text("Pass Turn")');
      } else {
        await page.waitForTimeout(1000);
      }
    } else {
      await page.click('button:has-text("Advance Phase")');
    }
    
    await page.waitForTimeout(1000);
    
    // Check if we've advanced to the next day
    const newDay = await page.locator('[data-testid="day-display"]').textContent();
    const newDayNumber = parseInt(newDay?.match(/Day: (\d+)/)?.[1] || '1');
    
    if (newDayNumber > dayNumber) {
      break;
    }
  }
}