# Altered TCG Playwright Tests

This directory contains comprehensive integration tests for the Altered TCG game engine, based on the official rules book.

## Test Structure

### 1. `game-engine.spec.ts`

Complete integration tests covering:

- **Rule 4.1**: Game Setup Phase
- **Rule 4.2.1**: Morning Phase Mechanics
- **Rule 4.2.1.e**: Expand Mechanics
- **Rule 4.2.2**: Noon Phase Transition
- **Rule 4.2.3**: Afternoon Phase Turn Mechanics
- **Rule 5.1**: Card Playing Mechanics
- **Rule 7.5**: Victory Conditions

### 2. `phase-transitions.spec.ts`

Detailed phase transition testing:

- **Rule 4.1.l**: First Morning Phase Skip
- **Rule 4.2**: Complete Day Structure Progression
- **Rule 4.2.1**: Morning Phase Effects (Day 2+)
- **Rule 4.2.4**: Dusk Phase Progress Effects
- **Rule 4.2.5**: Night Phase Effects
- Phase timing and automation validation

### 3. `card-playing.spec.ts`

Comprehensive card playing mechanics:

- **Rule 5.1.2**: Card Playing Process
- **Rule 5.1.3**: Character Card Placement
- **Rule 5.1.4**: Permanent Card Placement
- **Rule 5.1.5**: Spell Card Resolution
- **Rule 5.1.6**: Cost Payment Validation
- **Rule 5.1.7**: Targeting and Zone Validation
- **Rule 7.4.1.b**: Cooldown Spell Mechanics

### 4. `expand-mechanics.spec.ts`

Detailed expand functionality testing:

- **Rule 4.2.1.e**: Expand availability in Morning phase
- Card-to-mana conversion mechanics
- Skip expand functionality
- Once-per-turn restrictions
- Phase-specific availability
- Day reset mechanics

## Required Test Data Attributes

The tests expect the following `data-testid` attributes in the UI:

### Game Board

- `data-testid="game-board"` - Main game container
- `data-testid="day-display"` - Day number display
- `data-testid="phase-display"` - Current phase display
- `data-testid="turn-indicator"` - Turn indicator (YOUR TURN/OPPONENT'S TURN)
- `data-testid="error-message"` - Error message display

### Player Areas

- `data-testid="player-hand"` - Player hand container
- `data-testid="deck-count"` - Deck card count
- `data-testid="mana-display"` - Mana orbs display (current/max)

### Zones

- `data-testid="expedition-zone"` - Expedition zone
- `data-testid="landmark-zone"` - Landmark zone
- `data-testid="reserve-zone"` - Reserve zone
- `data-testid="hero-zone"` - Hero zone

### Cards

- `data-testid="card"` - Individual card elements
- `data-testid="card-cost"` - Card cost display
- `data-testid="card-type"` - Card type display
- `data-testid="card-keywords"` - Card keywords display

### Card Grid (Deck Building)

- `data-testid="card-grid"` - Card grid container
- `data-testid="card-item"` - Individual card items in grid

### Zone Attributes

- `data-owner="self"` or `data-owner="opponent"` - Zone ownership

## Running Tests

```bash
# Install dependencies
bun install

# Run all tests
bunx playwright test

# Run specific test file
bunx playwright test tests/game-engine.spec.ts

# Run tests in headed mode (visible browser)
bunx playwright test --headed

# Run tests with debug mode
bunx playwright test --debug

# Generate test report
bunx playwright show-report
```

## Test Coverage

These tests validate:

1. **Rules Compliance**: All major game rules from the official rules book
2. **Phase Management**: Correct phase transitions and timing
3. **Card Mechanics**: Proper card playing, cost payment, and targeting
4. **Expand System**: Complete expand functionality and restrictions
5. **Turn Management**: Turn-based play and advancement
6. **Zone Management**: Correct card placement and movement
7. **Victory Conditions**: Game end detection and winner determination

## Prerequisites

Before running tests:

1. Ensure the development server is running (`bun run dev`)
2. Create at least one deck through the UI
3. Verify all UI components have the required `data-testid` attributes
4. Install Playwright browsers (`bunx playwright install`)

## Test Data

Tests create their own test decks but require:

- Access to the card database
- Functional deck creation interface
- Working game engine initialization

The tests are designed to be deterministic and should pass consistently with a properly implemented game engine following the Altered TCG rules.
