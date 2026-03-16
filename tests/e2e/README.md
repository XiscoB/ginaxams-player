# E2E Testing Documentation

This directory contains end-to-end (E2E) tests for the GinaXams Player application using Playwright.

## Overview

The E2E tests verify the complete user flow from exam import to results display, ensuring:
- Application loads successfully
- Exams can be imported via JSON files
- Simulacro attempts can be configured and started
- Questions render correctly with all answer options
- Answers can be selected and submitted
- Results are displayed accurately

## Running the Tests

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers (if not already done):
```bash
npx playwright install chromium
```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run with UI (for debugging)

```bash
npx playwright test --ui
```

### Run Specific Test File

```bash
npx playwright test tests/e2e/exam-flow.spec.ts
```

### Run in Headed Mode (to see the browser)

```bash
npx playwright test --headed
```

### Debug Mode

```bash
npx playwright test --debug
```

## Test Structure

```
tests/e2e/
├── exam-flow.spec.ts       # Main E2E test suite
├── fixtures/               # Test data
│   └── minimal-exam.json   # Minimal valid exam (Schema v2.0)
└── README.md              # This file
```

## Test Data

The `fixtures/minimal-exam.json` file contains a minimal valid exam according to the Schema v2.0 specification:
- 3 questions with 4 answers each
- Mix of general knowledge categories
- Valid feedback with citations and explanations

## Selectors

Tests use deterministic selectors via `data-testid` attributes added to the HTML:

| Element | data-testid |
|---------|-------------|
| Library screen | `library-screen` |
| File drop zone | `file-drop-zone` |
| Exam list | `exam-list` |
| Mode screen | `mode-screen` |
| Practice screen | `practice-screen` |
| Question number | `question-number` |
| Question text | `question-text` |
| Answers container | `answers-container` |
| Next button | `next-button` |
| Finish button | `finish-button` |
| Results screen | `results-screen` |
| Final score | `final-score` |
| Onboarding skip | `onboarding-skip` |

## Configuration

Playwright configuration is in `playwright.config.ts` at the project root:
- Runs against Vite dev server (http://localhost:5173)
- Uses Chromium browser in headless mode
- Auto-starts the dev server before tests
- CI-compatible with retries and single-worker mode

## Architecture Notes

- Tests are fully client-side (no backend required)
- IndexedDB is cleared before each test for isolation
- Onboarding modal is automatically skipped if present
- Timers are disabled (set to "No timer") for deterministic execution
- Tests respect the architectural constraints defined in `AGENTS.md`

## Troubleshooting

### Port already in use
If port 5173 is already in use, the tests will fail to start the dev server.
Either kill the existing process or modify the port in `playwright.config.ts`.

### Tests timeout
If tests timeout, check that:
1. The Vite dev server starts correctly: `npm run dev`
2. The application loads without errors in the browser
3. IndexedDB is accessible (not blocked by browser settings)

### Browser not found
If Playwright reports browser not found, reinstall:
```bash
npx playwright install chromium
```
