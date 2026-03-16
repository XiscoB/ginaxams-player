/**
 * Timer module unit tests
 *
 * Tests for:
 * - Countdown decreases
 * - Timeout fires once
 * - Pause stops countdown
 * - Resume continues
 * - Stop prevents timeout
 * - Multiple starts handled safely
 *
 * Uses fake timers (Vitest).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExamTimer, createTimer, TimerEvent } from "../timer.js";

describe("ExamTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // Construction
  // ============================================================================

  describe("construction", () => {
    it("creates timer with valid duration", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });

      expect(timer.getDurationSeconds()).toBe(60);
      expect(timer.getRemainingSeconds()).toBe(60);
      expect(timer.getState()).toBe("idle");
    });

    it("throws on zero duration", () => {
      expect(() => new ExamTimer({ durationSeconds: 0 })).toThrow(
        "durationSeconds must be positive"
      );
    });

    it("throws on negative duration", () => {
      expect(() => new ExamTimer({ durationSeconds: -10 })).toThrow(
        "durationSeconds must be positive"
      );
    });

    it("accepts custom tick interval", () => {
      const timer = new ExamTimer({ durationSeconds: 60, tickIntervalMs: 500 });
      expect(timer.getDurationSeconds()).toBe(60);
    });
  });

  // ============================================================================
  // Start
  // ============================================================================

  describe("start", () => {
    it("starts countdown and emits start event", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const startListener = vi.fn();

      timer.on("start", startListener);
      timer.start();

      expect(timer.getState()).toBe("running");
      expect(startListener).toHaveBeenCalledOnce();
      expect(startListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "start",
          detail: expect.objectContaining({
            remainingSeconds: 60,
            totalSeconds: 60,
            state: "running",
          }),
        })
      );
    });

    it("decreases remaining seconds on tick", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      timer.start();

      expect(timer.getRemainingSeconds()).toBe(60);

      vi.advanceTimersByTime(1000);
      expect(timer.getRemainingSeconds()).toBe(59);

      vi.advanceTimersByTime(1000);
      expect(timer.getRemainingSeconds()).toBe(58);
    });

    it("emits tick events", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const tickListener = vi.fn();

      timer.on("tick", tickListener);
      timer.start();

      vi.advanceTimersByTime(3000);

      expect(tickListener).toHaveBeenCalledTimes(3);
    });

    it("multiple starts are handled safely (no-op if running)", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const startListener = vi.fn();

      timer.on("start", startListener);
      timer.start();
      timer.start(); // Second start should be ignored
      timer.start(); // Third start should be ignored

      expect(startListener).toHaveBeenCalledTimes(1);
      expect(timer.getState()).toBe("running");

      vi.advanceTimersByTime(1000);
      expect(timer.getRemainingSeconds()).toBe(59);
    });

    it("start from stopped state restarts timer", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      timer.start();

      vi.advanceTimersByTime(10000);
      expect(timer.getRemainingSeconds()).toBe(50);

      timer.stop();
      timer.start();

      expect(timer.getRemainingSeconds()).toBe(50); // Continues from where stopped
      expect(timer.getState()).toBe("running");
    });
  });

  // ============================================================================
  // Timeout
  // ============================================================================

  describe("timeout", () => {
    it("fires timeout event when reaching zero", () => {
      const timer = new ExamTimer({ durationSeconds: 5 });
      const timeoutListener = vi.fn();

      timer.on("timeout", timeoutListener);
      timer.start();

      vi.advanceTimersByTime(5000);

      expect(timeoutListener).toHaveBeenCalledOnce();
      expect(timer.getState()).toBe("timedOut");
    });

    it("timeout event fires only once", () => {
      const timer = new ExamTimer({ durationSeconds: 3 });
      const timeoutListener = vi.fn();

      timer.on("timeout", timeoutListener);
      timer.start();

      vi.advanceTimersByTime(5000);

      expect(timeoutListener).toHaveBeenCalledTimes(1);
    });

    it("remaining seconds is zero at timeout", () => {
      const timer = new ExamTimer({ durationSeconds: 3 });
      const timeoutListener = vi.fn();

      timer.on("timeout", (event) => {
        timeoutListener(event);
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      const event = timeoutListener.mock.calls[0][0] as TimerEvent;
      expect(event.detail.remainingSeconds).toBe(0);
    });

    it("calls onLockAnswers callback on timeout", () => {
      const onLockAnswers = vi.fn();
      const timer = new ExamTimer({
        durationSeconds: 3,
        callbacks: { onLockAnswers },
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(onLockAnswers).toHaveBeenCalledOnce();
    });

    it("calls onPersistAttempt callback on timeout", () => {
      const onPersistAttempt = vi.fn();
      const timer = new ExamTimer({
        durationSeconds: 3,
        callbacks: { onPersistAttempt },
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(onPersistAttempt).toHaveBeenCalledOnce();
    });

    it("calls callbacks in correct order (lock then persist)", () => {
      const callOrder: string[] = [];
      const onLockAnswers = vi.fn(() => callOrder.push("lock"));
      const onPersistAttempt = vi.fn(() => callOrder.push("persist"));

      const timer = new ExamTimer({
        durationSeconds: 3,
        callbacks: { onLockAnswers, onPersistAttempt },
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      expect(callOrder).toEqual(["lock", "persist"]);
    });
  });

  // ============================================================================
  // Pause
  // ============================================================================

  describe("pause", () => {
    it("stops countdown when paused", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      timer.start();

      vi.advanceTimersByTime(5000);
      expect(timer.getRemainingSeconds()).toBe(55);

      timer.pause();

      vi.advanceTimersByTime(5000);
      expect(timer.getRemainingSeconds()).toBe(55); // Should not decrease
    });

    it("emits pause event", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const pauseListener = vi.fn();

      timer.on("pause", pauseListener);
      timer.start();
      timer.pause();

      expect(pauseListener).toHaveBeenCalledOnce();
      expect(timer.getState()).toBe("paused");
    });

    it("pausing when not running is a no-op", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const pauseListener = vi.fn();

      timer.on("pause", pauseListener);
      timer.pause(); // Pause when idle

      expect(pauseListener).not.toHaveBeenCalled();
      expect(timer.getState()).toBe("idle");
    });
  });

  // ============================================================================
  // Resume
  // ============================================================================

  describe("resume", () => {
    it("continues countdown when resumed", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      timer.start();

      vi.advanceTimersByTime(5000);
      expect(timer.getRemainingSeconds()).toBe(55);

      timer.pause();
      vi.advanceTimersByTime(5000);
      expect(timer.getRemainingSeconds()).toBe(55);

      timer.resume();
      vi.advanceTimersByTime(3000);
      expect(timer.getRemainingSeconds()).toBe(52);
    });

    it("emits resume event", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const resumeListener = vi.fn();

      timer.on("resume", resumeListener);
      timer.start();
      timer.pause();
      timer.resume();

      expect(resumeListener).toHaveBeenCalledOnce();
      expect(timer.getState()).toBe("running");
    });

    it("resuming when not paused is a no-op", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const resumeListener = vi.fn();

      timer.on("resume", resumeListener);
      timer.start();
      timer.resume(); // Resume when running

      expect(resumeListener).not.toHaveBeenCalled();
    });

    it("start from paused state acts as resume", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      timer.start();

      vi.advanceTimersByTime(5000);
      timer.pause();

      expect(timer.getState()).toBe("paused");

      timer.start(); // Start when paused should resume

      expect(timer.getState()).toBe("running");
    });
  });

  // ============================================================================
  // Stop
  // ============================================================================

  describe("stop", () => {
    it("prevents timeout from firing", () => {
      const timer = new ExamTimer({ durationSeconds: 5 });
      const timeoutListener = vi.fn();

      timer.on("timeout", timeoutListener);
      timer.start();

      vi.advanceTimersByTime(3000);
      timer.stop();

      vi.advanceTimersByTime(5000);

      expect(timeoutListener).not.toHaveBeenCalled();
    });

    it("emits stop event", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const stopListener = vi.fn();

      timer.on("stop", stopListener);
      timer.start();
      timer.stop();

      expect(stopListener).toHaveBeenCalledOnce();
      expect(timer.getState()).toBe("stopped");
    });

    it("stops countdown", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      timer.start();

      vi.advanceTimersByTime(5000);
      expect(timer.getRemainingSeconds()).toBe(55);

      timer.stop();

      vi.advanceTimersByTime(5000);
      expect(timer.getRemainingSeconds()).toBe(55); // Should not decrease
    });

    it("stopping when stopped is a no-op", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const stopListener = vi.fn();

      timer.on("stop", stopListener);
      timer.start();
      timer.stop();
      timer.stop(); // Second stop

      expect(stopListener).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Event Subscription
  // ============================================================================

  describe("event subscription", () => {
    it("unsubscribe removes listener", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const listener = vi.fn();

      const unsubscribe = timer.on("tick", listener);
      timer.start();

      vi.advanceTimersByTime(1000);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      vi.advanceTimersByTime(2000);
      expect(listener).toHaveBeenCalledTimes(1); // No more calls
    });

    it("once listener only fires once", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const listener = vi.fn();

      timer.once("tick", listener);
      timer.start();

      vi.advanceTimersByTime(3000);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("off removes all listeners for event type", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      timer.on("tick", listener1);
      timer.on("tick", listener2);
      timer.off("tick");
      timer.start();

      vi.advanceTimersByTime(1000);
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it("off without arguments removes all listeners", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });
      const tickListener = vi.fn();
      const startListener = vi.fn();

      timer.on("tick", tickListener);
      timer.on("start", startListener);
      timer.off();
      timer.start();

      vi.advanceTimersByTime(1000);
      expect(tickListener).not.toHaveBeenCalled();
      expect(startListener).not.toHaveBeenCalled();
    });

    it("throws on unknown event type", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });

      expect(() => timer.on("unknown" as any, vi.fn())).toThrow(
        "Unknown event type"
      );
    });
  });

  // ============================================================================
  // State Checks
  // ============================================================================

  describe("state checks", () => {
    it("isRunning returns true only when running", () => {
      const timer = new ExamTimer({ durationSeconds: 60 });

      expect(timer.isRunning()).toBe(false);

      timer.start();
      expect(timer.isRunning()).toBe(true);

      timer.pause();
      expect(timer.isRunning()).toBe(false);

      timer.resume();
      expect(timer.isRunning()).toBe(true);

      timer.stop();
      expect(timer.isRunning()).toBe(false);
    });

    it("hasTimedOut returns true after timeout", () => {
      const timer = new ExamTimer({ durationSeconds: 3 });

      expect(timer.hasTimedOut()).toBe(false);

      timer.start();
      expect(timer.hasTimedOut()).toBe(false);

      vi.advanceTimersByTime(3000);
      expect(timer.hasTimedOut()).toBe(true);
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe("error handling", () => {
    it("timer continues if callback throws", () => {
      const onLockAnswers = vi.fn(() => {
        throw new Error("Lock failed");
      });
      const onPersistAttempt = vi.fn();

      const timer = new ExamTimer({
        durationSeconds: 3,
        callbacks: { onLockAnswers, onPersistAttempt },
      });

      timer.start();
      vi.advanceTimersByTime(3000);

      // Both should still be called despite error
      expect(onLockAnswers).toHaveBeenCalled();
      expect(onPersistAttempt).toHaveBeenCalled();
    });

    it("timer continues if listener throws", () => {
      const timer = new ExamTimer({ durationSeconds: 5 });
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodListener = vi.fn();

      timer.on("tick", errorListener);
      timer.on("tick", goodListener);
      timer.start();

      vi.advanceTimersByTime(1000);

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Factory Function
  // ============================================================================

  describe("createTimer factory", () => {
    it("creates ExamTimer instance", () => {
      const timer = createTimer({ durationSeconds: 60 });

      expect(timer).toBeInstanceOf(ExamTimer);
      expect(timer.getDurationSeconds()).toBe(60);
    });
  });

  // ============================================================================
  // Custom Tick Interval
  // ============================================================================

  describe("custom tick interval", () => {
    it("uses custom tick interval", () => {
      const timer = new ExamTimer({ durationSeconds: 60, tickIntervalMs: 500 });
      const tickListener = vi.fn();

      timer.on("tick", tickListener);
      timer.start();

      vi.advanceTimersByTime(1000);

      expect(tickListener).toHaveBeenCalledTimes(2);
    });
  });
});
