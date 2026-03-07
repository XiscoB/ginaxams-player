/**
 * Tests for buildKeyboardShortcuts — pure handler logic
 *
 * These tests run in Node (no DOM). We simulate KeyboardEvent and
 * HTML element targets using plain objects with the right shape.
 */

import { describe, it, expect, vi } from "vitest";
import { buildKeydownHandler } from "../buildKeyboardShortcuts.js";

function makeCallbacks() {
  return {
    onSelectAnswer: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onFlag: vi.fn(),
    onSubmitAnswer: vi.fn(),
  };
}

/**
 * Create a minimal KeyboardEvent-like object for testing.
 * Does NOT use the real KeyboardEvent constructor (unavailable in Node).
 */
function makeEvent(
  key: string,
  target?: Record<string, unknown>,
): KeyboardEvent {
  const prevented = { value: false };
  return {
    key,
    target: target ?? {},
    preventDefault: () => {
      prevented.value = true;
    },
  } as unknown as KeyboardEvent;
}

describe("buildKeydownHandler", () => {
  it("calls onSelectAnswer(0) for key '1'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("1"));
    expect(cb.onSelectAnswer).toHaveBeenCalledWith(0);
  });

  it("calls onSelectAnswer(1) for key '2'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("2"));
    expect(cb.onSelectAnswer).toHaveBeenCalledWith(1);
  });

  it("calls onSelectAnswer(2) for key '3'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("3"));
    expect(cb.onSelectAnswer).toHaveBeenCalledWith(2);
  });

  it("calls onSelectAnswer(3) for key '4'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("4"));
    expect(cb.onSelectAnswer).toHaveBeenCalledWith(3);
  });

  it("calls onNext for 'n'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("n"));
    expect(cb.onNext).toHaveBeenCalled();
  });

  it("calls onNext for 'N'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("N"));
    expect(cb.onNext).toHaveBeenCalled();
  });

  it("calls onPrevious for 'p'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("p"));
    expect(cb.onPrevious).toHaveBeenCalled();
  });

  it("calls onPrevious for 'P'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("P"));
    expect(cb.onPrevious).toHaveBeenCalled();
  });

  it("calls onFlag for 'f'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("f"));
    expect(cb.onFlag).toHaveBeenCalled();
  });

  it("calls onFlag for 'F'", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("F"));
    expect(cb.onFlag).toHaveBeenCalled();
  });

  it("calls onSubmitAnswer for Enter", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("Enter"));
    expect(cb.onSubmitAnswer).toHaveBeenCalled();
  });

  it("does nothing when not active", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => false);
    handler(makeEvent("n"));
    handler(makeEvent("1"));
    handler(makeEvent("f"));
    expect(cb.onNext).not.toHaveBeenCalled();
    expect(cb.onSelectAnswer).not.toHaveBeenCalled();
    expect(cb.onFlag).not.toHaveBeenCalled();
  });

  it("does nothing when target is an INPUT element", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("n", { tagName: "INPUT" }));
    expect(cb.onNext).not.toHaveBeenCalled();
  });

  it("does nothing when target is a TEXTAREA element", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("f", { tagName: "TEXTAREA" }));
    expect(cb.onFlag).not.toHaveBeenCalled();
  });

  it("does nothing when target is a SELECT element", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("1", { tagName: "SELECT" }));
    expect(cb.onSelectAnswer).not.toHaveBeenCalled();
  });

  it("does nothing for unhandled keys", () => {
    const cb = makeCallbacks();
    const handler = buildKeydownHandler(cb, () => true);
    handler(makeEvent("x"));
    handler(makeEvent("5"));
    handler(makeEvent("Escape"));
    expect(cb.onSelectAnswer).not.toHaveBeenCalled();
    expect(cb.onNext).not.toHaveBeenCalled();
    expect(cb.onPrevious).not.toHaveBeenCalled();
    expect(cb.onFlag).not.toHaveBeenCalled();
    expect(cb.onSubmitAnswer).not.toHaveBeenCalled();
  });
});
