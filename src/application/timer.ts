/**
 * Timer Module - Application layer countdown timer
 *
 * ⚠️ IMPORTANT:
 * - Timer does NOT contain scoring logic.
 * - Timer does NOT contain telemetry logic.
 * - Timer does NOT compute domain state.
 *
 * This is an orchestration utility only.
 *
 * Responsibilities:
 * - Countdown in seconds
 * - Emits tick events
 * * Emits timeout event
 * - Supports: start(), pause(), resume(), stop()
 * - Auto-submit callback injection required
 * - Must lock answers via injected callback
 * - Must persist attempt via injected callback
 *
 * Framework-agnostic: Uses event-based architecture.
 * No DOM access.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Timer state
 */
export type TimerState = "idle" | "running" | "paused" | "stopped" | "timedOut";

/**
 * Timer event types
 */
export type TimerEventType = "tick" | "timeout" | "pause" | "resume" | "stop" | "start";

/**
 * Timer event detail
 */
export interface TimerEventDetail {
  remainingSeconds: number;
  totalSeconds: number;
  state: TimerState;
}

/**
 * Timer event payload
 */
export interface TimerEvent {
  type: TimerEventType;
  detail: TimerEventDetail;
}

/**
 * Timer event listener
 */
export type TimerEventListener = (event: TimerEvent) => void;

/**
 * Callbacks for timer actions (injected dependencies)
 */
export interface TimerCallbacks {
  /** Called when timer expires - should lock answers */
  onLockAnswers?: () => void;
  /** Called when timer expires - should persist attempt */
  onPersistAttempt?: () => void;
}

/**
 * Timer configuration
 */
export interface TimerConfig {
  /** Total time in seconds */
  durationSeconds: number;
  /** Optional callbacks for timeout actions */
  callbacks?: TimerCallbacks;
  /** Tick interval in milliseconds (default: 1000) */
  tickIntervalMs?: number;
}

// ============================================================================
// Timer Class
// ============================================================================

/**
 * Exam countdown timer.
 *
 * Event-based timer that handles countdown logic without
 * any domain knowledge or DOM access.
 */
export class ExamTimer {
  private durationSeconds: number;
  private remainingSeconds: number;
  private state: TimerState;
  private callbacks: TimerCallbacks;
  private tickIntervalMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<TimerEventType, Set<TimerEventListener>>;

  constructor(config: TimerConfig) {
    if (config.durationSeconds <= 0) {
      throw new Error("durationSeconds must be positive");
    }

    this.durationSeconds = config.durationSeconds;
    this.remainingSeconds = config.durationSeconds;
    this.state = "idle";
    this.callbacks = config.callbacks ?? {};
    this.tickIntervalMs = config.tickIntervalMs ?? 1000;
    this.listeners = new Map();

    // Initialize listener sets for all event types
    const eventTypes: TimerEventType[] = ["tick", "timeout", "pause", "resume", "stop", "start"];
    for (const type of eventTypes) {
      this.listeners.set(type, new Set());
    }
  }

  // ============================================================================
  // Public API - State Accessors
  // ============================================================================

  /**
   * Get current remaining time in seconds
   */
  getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  /**
   * Get total duration in seconds
   */
  getDurationSeconds(): number {
    return this.durationSeconds;
  }

  /**
   * Get current timer state
   */
  getState(): TimerState {
    return this.state;
  }

  /**
   * Check if timer is currently running
   */
  isRunning(): boolean {
    return this.state === "running";
  }

  /**
   * Check if timer has timed out
   */
  hasTimedOut(): boolean {
    return this.state === "timedOut";
  }

  // ============================================================================
  // Public API - Control Methods
  // ============================================================================

  /**
   * Start the timer.
   *
   * - Can only start from idle or stopped state
   * - Multiple starts are handled safely (no-op if already running)
   * - Emits "start" event
   * - Begins countdown
   */
  start(): void {
    if (this.state === "running") {
      // Already running, safe no-op
      return;
    }

    if (this.state === "timedOut") {
      // Cannot restart after timeout
      return;
    }

    if (this.state === "paused") {
      // Use resume for paused state
      this.resume();
      return;
    }

    // Start from idle or stopped state
    this.state = "running";
    this.emit("start", this.getEventDetail());
    this.startInterval();
  }

  /**
   * Pause the timer.
   *
   * - Only pauses if currently running
   * - Stops the countdown
   * - Emits "pause" event
   */
  pause(): void {
    if (this.state !== "running") {
      return;
    }

    this.state = "paused";
    this.stopInterval();
    this.emit("pause", this.getEventDetail());
  }

  /**
   * Resume the timer.
   *
   * - Only resumes if currently paused
   * - Restarts the countdown
   * - Emits "resume" event
   */
  resume(): void {
    if (this.state !== "paused") {
      return;
    }

    this.state = "running";
    this.emit("resume", this.getEventDetail());
    this.startInterval();
  }

  /**
   * Stop the timer.
   *
   * - Stops countdown if running or paused
   * - Prevents timeout from firing
   * - Emits "stop" event
   * - Timer cannot be resumed after stop, only restarted via start()
   */
  stop(): void {
    if (this.state === "stopped" || this.state === "timedOut" || this.state === "idle") {
      return;
    }

    this.state = "stopped";
    this.stopInterval();
    this.emit("stop", this.getEventDetail());
  }

  // ============================================================================
  // Public API - Event Subscription
  // ============================================================================

  /**
   * Subscribe to a timer event
   *
   * @param event - Event type to listen for
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  on(event: TimerEventType, listener: TimerEventListener): () => void {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      throw new Error(`Unknown event type: ${event}`);
    }

    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * Subscribe to a timer event for one emission only
   *
   * @param event - Event type to listen for
   * @param listener - Callback function
   */
  once(event: TimerEventType, listener: TimerEventListener): void {
    const unsubscribe = this.on(event, (e) => {
      unsubscribe();
      listener(e);
    });
  }

  /**
   * Remove all listeners for an event type, or all listeners entirely
   *
   * @param event - Optional specific event type to clear
   */
  off(event?: TimerEventType): void {
    if (event) {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.clear();
      }
    } else {
      // Clear all listeners
      for (const listeners of this.listeners.values()) {
        listeners.clear();
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get current event detail
   */
  private getEventDetail(): TimerEventDetail {
    return {
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.durationSeconds,
      state: this.state,
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(type: TimerEventType, detail: TimerEventDetail): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    const event: TimerEvent = { type, detail };

    // Use setTimeout to ensure async delivery (prevents listener errors from breaking timer)
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        // Log but don't break timer operation
        console.error(`Timer listener error for ${type}:`, error);
      }
    }
  }

  /**
   * Start the interval timer
   */
  private startInterval(): void {
    // Clear any existing interval first (safety)
    this.stopInterval();

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  /**
   * Stop the interval timer
   */
  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Process a tick (decrement remaining time)
   */
  private tick(): void {
    this.remainingSeconds -= 1;

    // Emit tick event
    this.emit("tick", this.getEventDetail());

    // Check for timeout
    if (this.remainingSeconds <= 0) {
      this.handleTimeout();
    }
  }

  /**
   * Handle timer expiration
   */
  private handleTimeout(): void {
    this.stopInterval();
    this.state = "timedOut";

    // Ensure remaining doesn't go negative
    this.remainingSeconds = 0;

    // Emit timeout event
    this.emit("timeout", this.getEventDetail());

    // Execute injected callbacks
    this.executeTimeoutCallbacks();
  }

  /**
   * Execute timeout callbacks (auto-submit, lock answers, persist attempt)
   */
  private executeTimeoutCallbacks(): void {
    // Lock answers first
    if (this.callbacks.onLockAnswers) {
      try {
        this.callbacks.onLockAnswers();
      } catch (error) {
        console.error("Error in onLockAnswers callback:", error);
      }
    }

    // Persist attempt
    if (this.callbacks.onPersistAttempt) {
      try {
        this.callbacks.onPersistAttempt();
      } catch (error) {
        console.error("Error in onPersistAttempt callback:", error);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new exam timer instance.
 *
 * @param config - Timer configuration
 * @returns ExamTimer instance
 */
export function createTimer(config: TimerConfig): ExamTimer {
  return new ExamTimer(config);
}
