# Turborepo Structure Options for the Altered TCG Project

## Introduction

This document outlines three potential options for restructuring the Altered TCG project using Turborepo. The goal is to leverage Turborepo's capabilities for improved build times, better separation of concerns, and easier project management. Each option presents a different level of granularity and modularity.

## Core Project Components Identified

Before defining the options, the following core logical components were identified in the existing project:

1.  **SvelteKit Frontend Application**: UI, routes, app-specific libraries, static assets.
2.  **Game Engine**: Core game rules, state management, actions, phases.
3.  **AI Logic**: Genkit flows, deck advisor, etc.
4.  **Game Data**: Card definitions, mock data, related TypeScript types.
5.  **Shared UI Components**: Generic UI elements (buttons, cards).
6.  **Testing Suite**: E2E and unit tests.
7.  **Shared Configuration**: ESLint, TypeScript, Prettier, etc.
8.  **Documentation**: Project-related documents.

## Option 1: Minimal Separation (Lean Structure)

- **Description**: This option aims for a simpler setup with fewer packages, grouping closely related modules. It's a good starting point if you want to introduce Turborepo with less initial refactoring.
- **Proposed Structure**:
  - `apps/`
    - `web`: The main SvelteKit application (merging current `src/`, `public/`, and UI components from `src/components/`).
  - `packages/`
    - `game-logic`: Combines the game engine (`src/engine/`), game data (`src/data/`), and AI logic (`src/ai/`).
    - `eslint-config-custom`: Shared ESLint configuration.
    - `tsconfig`: Shared TypeScript configurations.
- **Rationale**: Reduces the number of packages to manage initially. Good if the `game-engine`, `game-data`, and `ai-logic` are almost exclusively consumed by the `web` app and their independent versioning or use is not an immediate concern.

- **Pros**:

  - **Easiest Initial Setup**: Less refactoring required.
  - **Simpler Dependency Management**: Fewer internal packages.
  - **Good for Tightly Coupled Modules**: Simpler if engine, data, and AI are rarely changed independently.
  - **Reduced Overhead**: Slightly less configuration per package.

- **Cons**:
  - **Less Granular Caching**: Changes to any part of `game-logic` invalidate the cache for the entire package.
  - **Limited Reusability**: Harder to reuse engine, data, or AI logic independently.
  - **Scalability Concerns**: `game-logic` might become a monolith over time.
  - **Weaker Separation of Concerns**: Boundaries within `game-logic` are not as strongly enforced.

## Option 2: Balanced Modularity (Recommended)

- **Description**: This option offers a good balance between separation of concerns, maintainability, and scalability. Each major logical unit becomes a package.
- **Proposed Structure**:
  - `apps/`
    - `web`: The SvelteKit application (current `src/` contents minus extracted packages, `public/`).
  - `packages/`
    - `game-engine`: Core game logic (from `src/engine/`).
    - `ai-logic`: AI-specific functionalities (from `src/ai/`).
    - `game-data`: Card data and related types (from `src/data/`).
    - `ui-components`: Reusable Svelte UI components (from `src/components/ui/`).
    - `eslint-config-custom`: Shared ESLint configuration.
    - `tsconfig`: Shared TypeScript configurations.
- **Rationale**: Clear separation of concerns. Allows independent development, testing, and versioning. Optimizes Turborepo's caching. Packages can be reused.

- **Pros**:

  - **Clear Separation of Concerns**: Easier to understand, navigate, and maintain.
  - **Optimized Caching and Builds**: Changes in one package (e.g., `ai-logic`) don't trigger rebuilds for others (e.g., `game-engine`).
  - **Enhanced Reusability**: `game-engine`, `ai-logic`, `game-data`, `ui-components` can be used by other apps/services.
  - **Independent Development and Testing**: Teams/individuals can work on packages more independently.
  - **Scalability**: Scales well as new features are added.
  - **Better for Collaboration**: Clear boundaries reduce conflict risks.

- **Cons**:
  - **More Initial Refactoring**: More effort to set up compared to Option 1.
  - **Slightly More Complex Dependency Management**: More internal packages, though Turborepo helps.

## Option 3: Maximum Granularity (Highly Modular)

- **Description**: This option takes modularity a step further, breaking down components into even smaller, more focused packages. This can be beneficial for very large projects or when specific sub-modules have distinct lifecycles or are shared independently.
- **Proposed Structure (Example Breakdown)**:
  - `apps/`
    - `web`: The SvelteKit application.
  - `packages/`
    - `game-engine-core`: The absolute core of the game engine.
    - `game-engine-abilities`: If ability processing is complex and large enough.
    - `ai-deck-advisor`: Specific AI flow.
    - `game-data-cards`: Core card data.
    - `ui-button`: Individual UI component package.
    - `utils`: General shared utility functions.
    - `types`: Shared TypeScript types.
    - `eslint-config-custom`: Shared ESLint configuration.
    - `tsconfig`: Shared TypeScript configurations.
- **Rationale**: Extreme separation, leading to highly optimized build/test cycles for specific changes. Useful if many small parts are independently versioned or shared across numerous applications.

- **Pros**:

  - **Ultimate Caching Efficiency**: Changes to a specific part only affect that tiny package.
  - **Maximum Reusability of Smallest Parts**: Precise reuse of individual components/utilities.
  - **Independent Versioning of Micro-Packages**: If necessary, small parts can be versioned independently.
  - **Ideal for Very Large, Distributed Teams/Projects**: Beneficial for highly isolated work in large systems.

- **Cons**:
  - **Significant Setup and Configuration Overhead**: Many `package.json` files, complex dependency graph.
  - **Increased Cognitive Load**: Harder to navigate and understand interrelations.
  - **Potential for Over-Fragmentation**: "Package jungle" if packages are too small.
  - **Diminishing Returns on Build Times**: Management overhead might offset some gains for this project's scale.
  - **Higher Risk of Circular Dependencies**.

## Conclusion

For the Altered TCG project at its current stage, **Option 2: Balanced Modularity** is likely the most suitable. It provides a strong foundation for growth, optimizes Turborepo's benefits effectively, and maintains a clear and manageable project structure without introducing excessive complexity. Option 1 might be too coarse, limiting future flexibility and Turborepo's advantages, while Option 3 is likely overkill and could introduce unnecessary management overhead.
