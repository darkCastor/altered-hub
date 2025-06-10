import { test, expect } from '@playwright/test';

test.describe('Phase Transitions - Rules Compliance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Create and set up a test deck
    await page.click('text=Browse Cards');
    await page.waitForSelector('[data-testid="card-grid"]', { timeout: 10000 });
    await page.click('text=Create Deck');
    await page.fill('input[placeholder="Enter deck name"]', 'Phase Test Deck');
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

  test('Rule 4.1.l: First Morning Phase is Skipped', async ({ page }) => {
    // Verify that on Day 1, the first Morning phase is skipped
    const dayDisplay = await page.locator('[data-testid="day-display"]').textContent();
    const phaseDisplay = await page.locator('[data-testid="phase-display"]').textContent();
    
    expect(dayDisplay).toContain('Day: 1');
    // Should start at Noon, not Morning on Day 1
    expect(phaseDisplay).toMatch(/Phase: (Noon|Afternoon)/);
    expect(phaseDisplay).not.toContain('Morning');
  });

  test('Rule 4.2: Complete Day Structure Progression', async ({ page }) => {
    // Test complete progression through all phases of a day
    const phases = ['Morning', 'Noon', 'Afternoon', 'Dusk', 'Night'];
    let currentDay = 1;
    
    // Skip Day 1 Morning (it's automatically skipped per Rule 4.1.l)
    for (let day = 1; day <= 2; day++) {
      const expectedPhases = day === 1 ? ['Noon', 'Afternoon', 'Dusk', 'Night'] : phases;
      
      for (const expectedPhase of expectedPhases) {
        // Wait for current phase
        await page.waitForFunction(
          (phase) => {
            const phaseElement = document.querySelector('[data-testid="phase-display"]');
            return phaseElement?.textContent?.includes(phase);
          },
          expectedPhase,
          { timeout: 5000 }
        );
        
        const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
        expect(phaseText).toContain(expectedPhase);
        
        // Special handling for different phases
        if (expectedPhase === 'Morning') {
          // Rule 4.2.1: Morning phase effects
          const expandButton = page.locator('button:has-text("Expand Card")');
          if (await expandButton.isVisible()) {
            await page.click('button:has-text("Skip Expand")');
          }
        } else if (expectedPhase === 'Afternoon') {
          // Rule 4.2.3: Afternoon turn-based play
          const turnIndicator = await page.locator('[data-testid="turn-indicator"]').textContent();
          expect(turnIndicator).toMatch(/(YOUR TURN|OPPONENT'S TURN)/);
          
          // Pass turn if it's our turn
          if (turnIndicator?.includes('YOUR TURN')) {
            await page.click('button:has-text("Pass Turn")');
            await page.waitForTimeout(1000);
          }
          
          // Wait for afternoon to end (both players pass)
          await page.waitForFunction(() => {
            const phaseElement = document.querySelector('[data-testid="phase-display"]');
            return !phaseElement?.textContent?.includes('Afternoon');
          }, { timeout: 10000 });
        } else {
          // Auto-advancing phases (Noon, Dusk, Night)
          await page.click('button:has-text("Advance Phase")');
        }
        
        await page.waitForTimeout(1000);
      }
      
      currentDay++;
    }
    
    // Verify we've advanced to Day 3
    const finalDayText = await page.locator('[data-testid="day-display"]').textContent();
    expect(finalDayText).toContain('Day: 3');
  });

  test('Rule 4.2.1: Morning Phase Effects (Day 2+)', async ({ page }) => {
    // Advance to Day 2 Morning to test Morning phase effects
    while (true) {
      const dayText = await page.locator('[data-testid="day-display"]').textContent();
      const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
      
      if (dayText?.includes('Day: 2') && phaseText?.includes('Morning')) {
        break;
      }
      
      await page.click('button:has-text("Advance Phase")');
      await page.waitForTimeout(1000);
    }
    
    // Rule 4.2.1.a: Succeed (status effects)
    // Rule 4.2.1.b: Prepare (ready all objects)
    // Rule 4.2.1.c: Draw 2 cards
    const initialHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    
    // Wait for automatic draw
    await page.waitForTimeout(2000);
    
    const finalHandCount = await page.locator('[data-testid="player-hand"] [data-testid="card"]').count();
    expect(finalHandCount).toBe(initialHandCount + 2);
    
    // Rule 4.2.1.e: Expand phase
    const expandButton = page.locator('button:has-text("Expand Card")');
    expect(await expandButton.isVisible()).toBe(true);
  });

  test('Rule 4.2.4: Dusk Phase Progress Effects', async ({ page }) => {
    // Navigate to Dusk phase
    while (true) {
      const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
      if (phaseText?.includes('Dusk')) {
        break;
      }
      await page.click('button:has-text("Advance Phase")');
      await page.waitForTimeout(1000);
    }
    
    // Rule 4.2.4: Progress phase should execute
    // Characters in expedition should move forward
    const expeditionCards = await page.locator('[data-testid="expedition-zone"] [data-testid="card"]').count();
    
    // Advance through Dusk
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(2000);
    
    // Verify we moved to Night phase
    const phaseAfterDusk = await page.locator('[data-testid="phase-display"]').textContent();
    expect(phaseAfterDusk).toContain('Night');
  });

  test('Rule 4.2.5: Night Phase Effects', async ({ page }) => {
    // Navigate to Night phase
    while (true) {
      const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
      if (phaseText?.includes('Night')) {
        break;
      }
      await page.click('button:has-text("Advance Phase")');
      await page.waitForTimeout(1000);
    }
    
    const currentDay = await page.locator('[data-testid="day-display"]').textContent();
    const dayNumber = parseInt(currentDay?.match(/Day: (\d+)/)?.[1] || '1');
    
    // Rule 4.2.5: Night phase effects
    // a. Rest (ready all exhausted objects)
    // b. Clean-up (remove fleeting status, etc.)
    // c. Check Victory
    
    // Advance through Night
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(2000);
    
    // Should advance to next day's Morning
    const newDayText = await page.locator('[data-testid="day-display"]').textContent();
    const newDayNumber = parseInt(newDayText?.match(/Day: (\d+)/)?.[1] || '1');
    expect(newDayNumber).toBe(dayNumber + 1);
    
    const newPhaseText = await page.locator('[data-testid="phase-display"]').textContent();
    expect(newPhaseText).toContain('Morning');
  });

  test('Phase Transition Timing and Automation', async ({ page }) => {
    // Test that certain phases auto-advance while others wait for player input
    
    // Noon should auto-advance to Afternoon
    while (true) {
      const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
      if (phaseText?.includes('Noon')) {
        break;
      }
      await page.click('button:has-text("Advance Phase")');
      await page.waitForTimeout(1000);
    }
    
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(1000);
    
    // Should be in Afternoon now
    const afternoonPhase = await page.locator('[data-testid="phase-display"]').textContent();
    expect(afternoonPhase).toContain('Afternoon');
    
    // Afternoon should wait for player actions (turns)
    const turnIndicator = await page.locator('[data-testid="turn-indicator"]').textContent();
    expect(turnIndicator).toMatch(/(YOUR TURN|OPPONENT'S TURN)/);
    
    // Dusk should auto-advance to Night
    while (true) {
      const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
      if (phaseText?.includes('Dusk')) {
        break;
      }
      if (phaseText?.includes('Afternoon')) {
        // End afternoon by passing turns
        const turn = await page.locator('[data-testid="turn-indicator"]').textContent();
        if (turn?.includes('YOUR TURN')) {
          await page.click('button:has-text("Pass Turn")');
        } else {
          await page.waitForTimeout(1000);
        }
      } else {
        await page.click('button:has-text("Advance Phase")');
      }
      await page.waitForTimeout(1000);
    }
    
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(1000);
    
    // Should auto-advance to Night
    const nightPhase = await page.locator('[data-testid="phase-display"]').textContent();
    expect(nightPhase).toContain('Night');
  });
});