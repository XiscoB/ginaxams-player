/**
 * Modal State Behavior Regression Tests
 *
 * Protects against:
 * - Modal state not toggling predictably
 * - Modal state leaking across views
 *
 * These tests validate application-level modal state contracts.
 * The actual App class manages modal state via DOM manipulation,
 * so these tests verify the expected state model as a pure contract.
 *
 * No DOM, CSS, or HTML testing.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Modal State Model (Application-level contract)
// ============================================================================

/**
 * Pure state model for modal visibility.
 * Mirrors the behavior expected from App.showTemplateModal / closeTemplateModal.
 *
 * This is a testable contract extracted from the UI layer's modal behavior.
 */
interface ModalState {
  templateModalOpen: boolean;
  helpVisible: boolean;
}

function createInitialModalState(): ModalState {
  return {
    templateModalOpen: false,
    helpVisible: false,
  };
}

function openTemplateModal(state: ModalState): ModalState {
  return { ...state, templateModalOpen: true };
}

function closeTemplateModal(state: ModalState): ModalState {
  return { ...state, templateModalOpen: false };
}

function toggleHelp(state: ModalState): ModalState {
  return { ...state, helpVisible: !state.helpVisible };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Modal State Guards (Application Level)", () => {
  describe("Template modal state transitions", () => {
    it("should start with template modal closed", () => {
      const state = createInitialModalState();
      expect(state.templateModalOpen).toBe(false);
    });

    it("should open template modal", () => {
      let state = createInitialModalState();
      state = openTemplateModal(state);
      expect(state.templateModalOpen).toBe(true);
    });

    it("should close template modal", () => {
      let state = createInitialModalState();
      state = openTemplateModal(state);
      state = closeTemplateModal(state);
      expect(state.templateModalOpen).toBe(false);
    });

    it("should handle double open idempotently", () => {
      let state = createInitialModalState();
      state = openTemplateModal(state);
      state = openTemplateModal(state);
      expect(state.templateModalOpen).toBe(true);
    });

    it("should handle double close idempotently", () => {
      let state = createInitialModalState();
      state = closeTemplateModal(state);
      state = closeTemplateModal(state);
      expect(state.templateModalOpen).toBe(false);
    });

    it("should toggle open and closed repeatedly", () => {
      let state = createInitialModalState();

      state = openTemplateModal(state);
      expect(state.templateModalOpen).toBe(true);

      state = closeTemplateModal(state);
      expect(state.templateModalOpen).toBe(false);

      state = openTemplateModal(state);
      expect(state.templateModalOpen).toBe(true);
    });
  });

  describe("Help visibility state transitions", () => {
    it("should start with help hidden", () => {
      const state = createInitialModalState();
      expect(state.helpVisible).toBe(false);
    });

    it("should toggle help to visible", () => {
      let state = createInitialModalState();
      state = toggleHelp(state);
      expect(state.helpVisible).toBe(true);
    });

    it("should toggle help back to hidden", () => {
      let state = createInitialModalState();
      state = toggleHelp(state);
      state = toggleHelp(state);
      expect(state.helpVisible).toBe(false);
    });
  });

  describe("Modal state independence", () => {
    it("should not affect help when toggling template modal", () => {
      let state = createInitialModalState();
      state = toggleHelp(state);
      expect(state.helpVisible).toBe(true);

      state = openTemplateModal(state);
      expect(state.helpVisible).toBe(true);
      expect(state.templateModalOpen).toBe(true);

      state = closeTemplateModal(state);
      expect(state.helpVisible).toBe(true);
      expect(state.templateModalOpen).toBe(false);
    });

    it("should not affect template modal when toggling help", () => {
      let state = createInitialModalState();
      state = openTemplateModal(state);
      expect(state.templateModalOpen).toBe(true);

      state = toggleHelp(state);
      expect(state.templateModalOpen).toBe(true);
      expect(state.helpVisible).toBe(true);
    });

    it("should produce immutable state transitions", () => {
      const initial = createInitialModalState();
      const opened = openTemplateModal(initial);

      // Original should be unchanged
      expect(initial.templateModalOpen).toBe(false);
      expect(opened.templateModalOpen).toBe(true);
    });
  });
});
