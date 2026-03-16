/**
 * E2E Test: Full Exam Flow
 *
 * This test verifies the complete exam flow from import to results:
 * 1. Application loads successfully
 * 2. An exam JSON can be imported
 * 3. A simulacro attempt can be started
 * 4. Questions render correctly
 * 5. An answer can be selected
 * 6. The exam can be submitted
 * 7. The final score view appears
 *
 * @requires Playwright
 * @architecture E2E deterministic test with data-testid selectors
 */

import { test, expect } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the directory path for resolving fixture files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Helper: Get path to fixture file
 */
function getFixturePath(filename: string): string {
  return join(__dirname, "fixtures", filename);
}

/**
 * Helper: Skip onboarding if it appears
 */
async function skipOnboardingIfPresent(page): Promise<void> {
  const skipButton = page.locator('[data-testid="onboarding-skip"], #onboardingOverlay .onboarding-skip');
  
  // Check if onboarding is visible with a short timeout
  try {
    await skipButton.waitFor({ state: "visible", timeout: 2000 });
    await skipButton.click();
    // Wait for onboarding to disappear
    await expect(page.locator("#onboardingOverlay")).not.toBeVisible({ timeout: 5000 });
  } catch {
    // Onboarding not present, that's fine
  }
}

/**
 * Helper: Dismiss success modal if present
 */
async function dismissSuccessModalIfPresent(page): Promise<void> {
  // Look for the success modal using data-testid
  const modal = page.locator('[data-testid="confirm-modal-overlay"]');
  
  try {
    await modal.waitFor({ state: "visible", timeout: 3000 });
    // Click the OK button inside the modal (first button)
    await modal.locator("button").first().click();
    // Wait for modal to disappear
    await modal.waitFor({ state: "hidden", timeout: 3000 });
  } catch {
    // Modal not present, that's fine
  }
}

/**
 * Helper: Clear IndexedDB to ensure clean state
 * Wrapped in try-catch to handle security restrictions
 */
async function clearIndexedDB(page): Promise<void> {
  try {
    await page.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("ginaxams-db");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
  } catch {
    // Ignore errors - IndexedDB may not be accessible in some contexts
    // The test will continue with whatever state exists
  }
}

test.describe("Exam Flow E2E Test", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first to establish origin
    await page.goto("/");
    
    // Wait for the app to load
    await expect(page.locator('[data-testid="library-screen"]')).toBeVisible({ 
      timeout: 10000 
    });
    
    // Clear storage to ensure consistent state (after navigation)
    await clearIndexedDB(page);
    
    // Reload to apply clean state
    await page.reload();
    
    // Wait for the app to load again
    await expect(page.locator('[data-testid="library-screen"]')).toBeVisible({ 
      timeout: 10000 
    });
    
    // Skip onboarding if present
    await skipOnboardingIfPresent(page);
  });

  test("should complete full exam flow from import to results", async ({ page }) => {
    // ========================================================================
    // STEP 1: Import Exam JSON
    // ========================================================================
    
    // Wait for the file input area
    await expect(page.locator('[data-testid="file-drop-zone"]')).toBeVisible();
    
    // Upload the exam JSON file
    const fileInput = page.locator('input#fileInput[type="file"]');
    await fileInput.setInputFiles(getFixturePath("minimal-exam.json"));
    
    // Dismiss the import success modal if it appears
    await dismissSuccessModalIfPresent(page);
    
    // Wait for the exam to appear in the list (filter by specific exam text)
    const examItem = page.locator('[data-testid="exam-list"] .exam-item', {
      hasText: "E2E Test Exam"
    });
    await expect(examItem).toBeVisible({ timeout: 5000 });

    // ========================================================================
    // STEP 2: Select the Exam (open attempt config)
    // ========================================================================
    
    // Click on the exam item title to select it (avoiding action buttons)
    await examItem.locator(".exam-item-title").click();
    
    // Wait for the attempt config screen to appear
    // The attempt config screen is rendered dynamically
    await expect(page.locator("#attemptConfigScreen")).toBeVisible({ timeout: 5000 });
    
    // Verify we can see the mode selection options
    await expect(page.locator("#attemptConfigScreen .mode-card--simulacro")).toBeVisible();

    // ========================================================================
    // STEP 3: Start Simulacro Attempt
    // ========================================================================
    
    // Select "No timer" for deterministic testing
    await page.locator("#simulacroTimerSelect").selectOption("0");
    
    // Click the Simulacro start button
    await page.locator("#btnSimulacroMode").click();
    
    // Wait for the practice screen to appear
    await expect(page.locator('[data-testid="practice-screen"]')).toBeVisible({ 
      timeout: 5000 
    });

    // ========================================================================
    // STEP 4: Verify Questions Render
    // ========================================================================
    
    // Verify question number is displayed
    await expect(page.locator('[data-testid="question-number"]')).toBeVisible();
    
    // Verify question text is displayed (any question from our fixture)
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible();
    const questionText = await page.locator('[data-testid="question-text"]').textContent();
    // Verify it's one of our fixture questions
    expect([
      "What is the capital of France?",
      "Which planet is known as the Red Planet?",
      "What is 2 + 2?"
    ]).toContain(questionText);
    
    // Verify answers container has answer options
    const answersContainer = page.locator('[data-testid="answers-container"]');
    await expect(answersContainer).toBeVisible();
    
    // Verify there are answer options (4 answers in our fixture)
    const answerOptions = answersContainer.locator(".answer-option");
    await expect(answerOptions).toHaveCount(4);

    // ========================================================================
    // STEP 5: Select Answers for All Questions
    // ========================================================================
    
    // Answer all 3 questions (order may be shuffled by domain logic)
    // We'll select the first answer for each question to ensure deterministic behavior
    
    // Question 1: Select first answer and go next
    await answersContainer.locator(".answer-option").nth(0).click();
    await expect(answersContainer.locator(".answer-option").nth(0)).toHaveClass(/selected/);
    await page.locator('[data-testid="next-button"]').click();
    
    // Question 2: Select first answer and go next
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible();
    await page.locator('[data-testid="answers-container"] .answer-option').nth(0).click();
    await page.locator('[data-testid="next-button"]').click();
    
    // Question 3: Select first answer
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible();
    await page.locator('[data-testid="answers-container"] .answer-option').nth(0).click();

    // ========================================================================
    // STEP 6: Submit the Exam
    // ========================================================================
    
    // On the last question (3/3), the Finish button should be visible instead of Next
    const finishButton = page.locator('[data-testid="finish-button"]');
    await finishButton.click();
    
    // Wait for the Exam Summary modal to appear and click Submit
    const summaryModal = page.locator("#examSummaryModal");
    await expect(summaryModal).toBeVisible({ timeout: 5000 });
    await summaryModal.locator("button:has-text('Submit Exam')").click();
    
    // Wait for results screen to appear
    await expect(page.locator('[data-testid="results-screen"]')).toBeVisible({ 
      timeout: 5000 
    });

    // ========================================================================
    // STEP 7: Verify Final Score View
    // ========================================================================
    
    // Verify the score is displayed
    await expect(page.locator('[data-testid="final-score"]')).toBeVisible();
    
    // Verify the score is a valid percentage (0-100%)
    // Note: Exact score depends on shuffled answer order, so we just verify format
    const scoreText = await page.locator('[data-testid="final-score"]').textContent();
    expect(scoreText).toMatch(/\d+%/);
    
    // Verify the results stats grid shows counts that add up to 3
    const correctCount = await page.locator("#resultCorrectCount").textContent();
    const wrongCount = await page.locator("#resultWrongCount").textContent();
    const blankCount = await page.locator("#resultBlankCount").textContent();
    
    expect(parseInt(correctCount!) + parseInt(wrongCount!) + parseInt(blankCount!)).toBe(3);
    
    // Verify the results section title is visible
    await expect(page.locator("#txtResults")).toBeVisible();
    
    // Verify action buttons are present
    await expect(page.locator("#btnTryAgain")).toBeVisible();
    await expect(page.locator("#btnReviewAnswers")).toBeVisible();
  });

  test("should handle partial correct answers and show appropriate score", async ({ page }) => {
    // Import the exam
    const fileInput = page.locator('input#fileInput[type="file"]');
    await fileInput.setInputFiles(getFixturePath("minimal-exam.json"));
    
    // Dismiss the import success modal if it appears
    await dismissSuccessModalIfPresent(page);
    
    // Wait for the exam to appear and select it (specific exam)
    const examItem = page.locator('[data-testid="exam-list"] .exam-item', {
      hasText: "E2E Test Exam"
    });
    await expect(examItem).toBeVisible({ timeout: 5000 });
    await examItem.locator(".exam-item-title").click();
    
    // Wait for attempt config and start simulacro
    await expect(page.locator("#attemptConfigScreen")).toBeVisible({ timeout: 5000 });
    await page.locator("#simulacroTimerSelect").selectOption("0");
    await page.locator("#btnSimulacroMode").click();
    
    // Wait for practice screen
    await expect(page.locator('[data-testid="practice-screen"]')).toBeVisible({ 
      timeout: 5000 
    });
    
    // Answer pattern: 1 correct, 1 wrong, 1 blank (order is shuffled)
    // Q1: Select first answer (may be correct or wrong)
    await page.locator('[data-testid="answers-container"] .answer-option').nth(0).click();
    await page.locator('[data-testid="next-button"]').click();
    
    // Q2: Skip (leave blank) - just go next without selecting
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible();
    await page.locator('[data-testid="next-button"]').click();
    
    // Q3: Select first answer (may be correct or wrong) and submit
    await expect(page.locator('[data-testid="question-text"]')).toBeVisible();
    await page.locator('[data-testid="answers-container"] .answer-option').nth(0).click();
    
    // On last question, click Finish button
    await page.locator('[data-testid="finish-button"]').click();
    
    // Wait for the Exam Summary modal and click Submit
    const summaryModal = page.locator("#examSummaryModal");
    await expect(summaryModal).toBeVisible({ timeout: 5000 });
    await summaryModal.locator("button:has-text('Submit Exam')").click();
    
    // Wait for results
    await expect(page.locator('[data-testid="results-screen"]')).toBeVisible({ 
      timeout: 5000 
    });
    
    // Verify score is displayed (exact values depend on shuffled question order)
    const scoreText = await page.locator('[data-testid="final-score"]').textContent();
    expect(scoreText).toBeTruthy();
    expect(scoreText).toMatch(/\d+%/);
    
    // Verify the results grid shows counts (exact values depend on shuffled answers)
    const correctCount = await page.locator("#resultCorrectCount").textContent();
    const wrongCount = await page.locator("#resultWrongCount").textContent();
    const blankCount = await page.locator("#resultBlankCount").textContent();
    
    // Verify all counts are numeric
    expect(correctCount).toMatch(/^\d+$/);
    expect(wrongCount).toMatch(/^\d+$/);
    expect(blankCount).toMatch(/^\d+$/);
    
    // Verify total adds up to 3
    expect(parseInt(correctCount!) + parseInt(wrongCount!) + parseInt(blankCount!)).toBe(3);
  });
});
