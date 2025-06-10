import { test, expect } from '@playwright/test';

test.describe('Terrain and Mana System - Rules 2.2 & 3.2.5', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupTestDeck(page, 'Terrain Test Deck');
  });

  test('Rule 2.2.10: Character Statistics and Terrain Types', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Find characters and verify their terrain statistics
    const characters = page.locator('[data-testid="character-card"]');
    const characterCount = await characters.count();
    
    if (characterCount > 0) {
      const character = characters.first();
      
      // Rule 2.2.10: Each character has Forest, Mountain, and Water statistics
      const forestStat = character.locator('[data-testid="forest-stat"]');
      const mountainStat = character.locator('[data-testid="mountain-stat"]');
      const waterStat = character.locator('[data-testid="water-stat"]');
      
      expect(await forestStat.isVisible()).toBe(true);
      expect(await mountainStat.isVisible()).toBe(true);
      expect(await waterStat.isVisible()).toBe(true);
      
      // Verify stats are numeric values
      const forestValue = await forestStat.textContent();
      const mountainValue = await mountainStat.textContent();
      const waterValue = await waterStat.textContent();
      
      expect(parseInt(forestValue || '0')).toBeGreaterThanOrEqual(0);
      expect(parseInt(mountainValue || '0')).toBeGreaterThanOrEqual(0);
      expect(parseInt(waterValue || '0')).toBeGreaterThanOrEqual(0);
    }
  });

  test('Rule 3.2.5: Mana Zone and Orb Management', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Rule 3.2.5.a: Mana Zone contains Mana Orbs
    const manaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const [current, max] = manaDisplay?.split('/').map(s => parseInt(s)) || [0, 0];
    
    expect(max).toBeGreaterThan(0); // Should start with at least some mana orbs
    expect(current).toBeLessThanOrEqual(max);
    
    // Rule 3.2.5.b: Mana Orbs can be ready or exhausted
    const manaOrbs = page.locator('[data-testid="mana-orb"]');
    const orbCount = await manaOrbs.count();
    expect(orbCount).toBe(max);
    
    // Check orb states
    const readyOrbs = page.locator('[data-testid="mana-orb"]:not([data-status="exhausted"])');
    const exhaustedOrbs = page.locator('[data-testid="mana-orb"][data-status="exhausted"]');
    
    const readyCount = await readyOrbs.count();
    const exhaustedCount = await exhaustedOrbs.count();
    
    expect(readyCount + exhaustedCount).toBe(max);
    expect(readyCount).toBe(current);
  });

  test('Mana Orb Creation Through Expand', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    const initialManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const initialMax = parseInt(initialManaDisplay?.split('/')[1] || '0');
    
    // Expand a card to create a new mana orb
    const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
    if (await handCards.count() > 0) {
      await page.click('button:has-text("Expand Card")');
      await handCards.first().click();
      
      await page.waitForTimeout(1000);
      
      // Verify mana orb was created
      const finalManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
      const finalMax = parseInt(finalManaDisplay?.split('/')[1] || '0');
      
      expect(finalMax).toBe(initialMax + 1);
      
      // Rule 4.2.1.e: New mana orb enters ready
      const finalCurrent = parseInt(finalManaDisplay?.split('/')[0] || '0');
      expect(finalCurrent).toBe(finalMax);
    }
  });

  test('Terrain-Based Mana Providing', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Find characters in play and check their mana contribution
    const expeditionCharacters = page.locator('[data-testid="expedition-zone"] [data-testid="character-card"]');
    const characterCount = await expeditionCharacters.count();
    
    if (characterCount > 0) {
      const character = expeditionCharacters.first();
      
      // Get character's terrain statistics
      const forestStat = await character.locator('[data-testid="forest-stat"]').textContent();
      const mountainStat = await character.locator('[data-testid="mountain-stat"]').textContent();
      const waterStat = await character.locator('[data-testid="water-stat"]').textContent();
      
      const forestValue = parseInt(forestStat || '0');
      const mountainValue = parseInt(mountainStat || '0');
      const waterValue = parseInt(waterStat || '0');
      
      // Check available terrain mana
      const terrainManaDisplay = page.locator('[data-testid="terrain-mana-display"]');
      if (await terrainManaDisplay.isVisible()) {
        const terrainManaText = await terrainManaDisplay.textContent();
        
        // Should show available mana from characters' statistics
        expect(terrainManaText).toContain(`Forest: ${forestValue}`);
        expect(terrainManaText).toContain(`Mountain: ${mountainValue}`);
        expect(terrainManaText).toContain(`Water: ${waterValue}`);
      }
    }
  });

  test('Mana Cost Payment and Exhaustion', async ({ page }) => {
    await navigateToAfternoonTurn(page);
    
    const initialManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const initialCurrent = parseInt(initialManaDisplay?.split('/')[0] || '0');
    
    // Try to play a card that costs mana
    const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
    if (await handCards.count() > 0) {
      const cardToPlay = handCards.first();
      const costElement = cardToPlay.locator('[data-testid="card-cost"]');
      const costText = await costElement.textContent();
      const cost = parseInt(costText || '0');
      
      if (cost <= initialCurrent && cost > 0) {
        await cardToPlay.click();
        
        // Play the card
        const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
        await expeditionZone.click();
        
        await page.waitForTimeout(1000);
        
        // Verify mana was spent (orbs exhausted)
        const finalManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
        const finalCurrent = parseInt(finalManaDisplay?.split('/')[0] || '0');
        
        expect(finalCurrent).toBe(initialCurrent - cost);
        
        // Check that correct number of orbs are exhausted
        const exhaustedOrbs = page.locator('[data-testid="mana-orb"][data-status="exhausted"]');
        const exhaustedCount = await exhaustedOrbs.count();
        expect(exhaustedCount).toBe(cost);
      }
    }
  });

  test('Mana Orb Ready State Restoration', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Exhaust some mana by playing cards
    await spendMana(page, 2);
    
    const manaAfterSpending = await page.locator('[data-testid="mana-display"]').textContent();
    const currentAfterSpending = parseInt(manaAfterSpending?.split('/')[0] || '0');
    const maxMana = parseInt(manaAfterSpending?.split('/')[1] || '0');
    
    expect(currentAfterSpending).toBeLessThan(maxMana);
    
    // Rule 4.2.1.b: Mana orbs become ready during Morning Prepare step
    await advanceToNextMorning(page);
    
    const manaAfterMorning = await page.locator('[data-testid="mana-display"]').textContent();
    const currentAfterMorning = parseInt(manaAfterMorning?.split('/')[0] || '0');
    const maxAfterMorning = parseInt(manaAfterMorning?.split('/')[1] || '0');
    
    expect(currentAfterMorning).toBe(maxAfterMorning); // All mana should be ready
  });

  test('Terrain Mana vs Regular Mana Interaction', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Test that terrain mana (from character statistics) works alongside regular mana orbs
    const regularManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const regularMana = parseInt(regularManaDisplay?.split('/')[0] || '0');
    
    // Check terrain mana availability
    const terrainManaElements = page.locator('[data-testid="terrain-mana"]');
    let totalTerrainMana = 0;
    
    if (await terrainManaElements.count() > 0) {
      const forestMana = await page.locator('[data-testid="forest-mana"]').textContent();
      const mountainMana = await page.locator('[data-testid="mountain-mana"]').textContent();
      const waterMana = await page.locator('[data-testid="water-mana"]').textContent();
      
      totalTerrainMana = parseInt(forestMana || '0') + parseInt(mountainMana || '0') + parseInt(waterMana || '0');
    }
    
    // Total available mana should be regular + terrain
    const totalAvailableMana = regularMana + totalTerrainMana;
    
    // Try to play a card with high cost using both types of mana
    const highCostCard = await findCardWithMinimumCost(page, totalAvailableMana);
    if (highCostCard) {
      await highCostCard.click();
      
      const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
      await expeditionZone.click();
      
      // Should succeed if total mana is sufficient
      await page.waitForTimeout(1000);
      
      const cardStillInHand = await highCostCard.isVisible();
      expect(cardStillInHand).toBe(false);
    }
  });

  test('Mana Orb Face-Down State', async ({ page }) => {
    await navigateToMorningPhase(page);
    
    // Expand a card to create a mana orb
    const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
    if (await handCards.count() > 0) {
      const cardToExpand = handCards.first();
      const cardName = await cardToExpand.locator('[data-testid="card-name"]').textContent();
      
      await page.click('button:has-text("Expand Card")');
      await cardToExpand.click();
      
      await page.waitForTimeout(1000);
      
      // Rule 4.2.1.e: Card becomes a face-down Mana Orb
      const manaOrbs = page.locator('[data-testid="mana-orb"]');
      const newOrb = manaOrbs.last(); // Should be the newest orb
      
      // Verify it's face-down (original card identity hidden)
      const orbFaceDown = await newOrb.getAttribute('data-face-down');
      expect(orbFaceDown).toBe('true');
      
      // Verify original card name is not visible on the orb
      const orbText = await newOrb.textContent();
      expect(orbText).not.toContain(cardName);
    }
  });

  test('Complex Mana Cost Scenarios', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Test edge cases for mana payment
    
    // Test 1: Insufficient mana
    const manaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
    const availableMana = parseInt(manaDisplay?.split('/')[0] || '0');
    
    const highCostCard = await findCardWithMinimumCost(page, availableMana + 1);
    if (highCostCard) {
      await highCostCard.click();
      
      const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
      await expeditionZone.click();
      
      // Should fail and show error
      const errorMessage = page.locator('[data-testid="error-message"]');
      expect(await errorMessage.isVisible()).toBe(true);
      
      // Card should remain in hand
      expect(await highCostCard.isVisible()).toBe(true);
    }
    
    // Test 2: Exact mana cost
    const exactCostCard = await findCardWithExactCost(page, availableMana);
    if (exactCostCard) {
      await exactCostCard.click();
      await expeditionZone.click();
      
      await page.waitForTimeout(1000);
      
      // Should succeed and use all mana
      const finalManaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
      const finalMana = parseInt(finalManaDisplay?.split('/')[0] || '0');
      expect(finalMana).toBe(0);
    }
  });

  test('Mana Zone Maximum Capacity', async ({ page }) => {
    await navigateToGameplay(page);
    
    // Test if there's a maximum number of mana orbs
    let expandCount = 0;
    const maxExpands = 10; // Reasonable test limit
    
    while (expandCount < maxExpands) {
      await navigateToMorningPhase(page);
      
      const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
      if (await handCards.count() > 0) {
        const initialManaMax = await getManaMax(page);
        
        await page.click('button:has-text("Expand Card")');
        await handCards.first().click();
        
        await page.waitForTimeout(1000);
        
        const finalManaMax = await getManaMax(page);
        
        if (finalManaMax === initialManaMax) {
          // Hit maximum capacity
          break;
        }
        
        expect(finalManaMax).toBe(initialManaMax + 1);
        expandCount++;
      } else {
        break;
      }
      
      await advanceToNextDay(page);
    }
    
    // Should have successfully expanded multiple times or hit a reasonable limit
    expect(expandCount).toBeGreaterThan(0);
  });
});

// Helper functions for terrain and mana tests
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
  while (true) {
    const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
    if (phaseText?.includes('Afternoon')) {
      break;
    }
    await page.click('button:has-text("Advance Phase")');
    await page.waitForTimeout(1000);
  }
}

async function navigateToMorningPhase(page: any) {
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

async function advanceToNextDay(page: any) {
  const currentDay = await page.locator('[data-testid="day-display"]').textContent();
  const dayNumber = parseInt(currentDay?.match(/Day: (\d+)/)?.[1] || '1');
  
  while (true) {
    const newDay = await page.locator('[data-testid="day-display"]').textContent();
    const newDayNumber = parseInt(newDay?.match(/Day: (\d+)/)?.[1] || '1');
    
    if (newDayNumber > dayNumber) {
      break;
    }
    
    const phaseText = await page.locator('[data-testid="phase-display"]').textContent();
    
    if (phaseText?.includes('Afternoon')) {
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
  }
}

async function spendMana(page: any, amount: number) {
  let spentAmount = 0;
  
  while (spentAmount < amount) {
    const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
    const cardCount = await handCards.count();
    
    if (cardCount === 0) break;
    
    for (let i = 0; i < cardCount && spentAmount < amount; i++) {
      const card = handCards.nth(i);
      const costElement = card.locator('[data-testid="card-cost"]');
      const costText = await costElement.textContent();
      const cost = parseInt(costText || '0');
      
      if (cost > 0 && cost <= (amount - spentAmount)) {
        await card.click();
        
        const expeditionZone = page.locator('[data-testid="expedition-zone"][data-owner="self"]');
        await expeditionZone.click();
        
        await page.waitForTimeout(1000);
        spentAmount += cost;
        break;
      }
    }
    
    if (spentAmount === 0) break; // No suitable cards found
  }
}

async function findCardWithMinimumCost(page: any, minCost: number) {
  const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
  const cardCount = await handCards.count();
  
  for (let i = 0; i < cardCount; i++) {
    const card = handCards.nth(i);
    const costElement = card.locator('[data-testid="card-cost"]');
    const costText = await costElement.textContent();
    const cost = parseInt(costText || '0');
    
    if (cost >= minCost) {
      return card;
    }
  }
  return null;
}

async function findCardWithExactCost(page: any, exactCost: number) {
  const handCards = page.locator('[data-testid="player-hand"] [data-testid="card"]');
  const cardCount = await handCards.count();
  
  for (let i = 0; i < cardCount; i++) {
    const card = handCards.nth(i);
    const costElement = card.locator('[data-testid="card-cost"]');
    const costText = await costElement.textContent();
    const cost = parseInt(costText || '0');
    
    if (cost === exactCost) {
      return card;
    }
  }
  return null;
}

async function getManaMax(page: any): Promise<number> {
  const manaDisplay = await page.locator('[data-testid="mana-display"]').textContent();
  return parseInt(manaDisplay?.split('/')[1] || '0');
}