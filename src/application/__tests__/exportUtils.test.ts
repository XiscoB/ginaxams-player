/**
 * Unit tests for exportUtils — download, clipboard, and share utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadAsJson,
  copyJsonToClipboard,
  shareJson,
  canShareFiles,
} from "../exportUtils.js";

// ============================================================================
// downloadAsJson
// ============================================================================

describe("downloadAsJson", () => {
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revokeObjectURL = vi.fn();
    createObjectURL = vi
      .fn()
      .mockReturnValue("blob:mock-url") as unknown as ReturnType<typeof vi.fn>;
    globalThis.URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    clickSpy = vi.fn();
    const mockAnchor = {
      href: "",
      download: "",
      click: clickSpy,
    };
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(mockAnchor),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a blob and triggers a download click", () => {
    const data = { foo: "bar" };
    downloadAsJson(data, "test.json");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("formats JSON with 2-space indentation", () => {
    const data = { a: 1 };
    downloadAsJson(data, "out.json");

    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("application/json");
  });
});

// ============================================================================
// copyJsonToClipboard
// ============================================================================

describe("copyJsonToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when clipboard write succeeds", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    const result = await copyJsonToClipboard({ hello: "world" });
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ hello: "world" }, null, 2),
    );
  });

  it("returns false when clipboard write fails", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    const result = await copyJsonToClipboard({ x: 1 });
    expect(result).toBe(false);
  });
});

// ============================================================================
// canShareFiles
// ============================================================================

describe("canShareFiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when navigator.share and navigator.canShare exist", () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    expect(canShareFiles()).toBe(true);
  });

  it("returns false when navigator.share is missing", () => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    expect(canShareFiles()).toBe(false);
  });
});

// ============================================================================
// shareJson
// ============================================================================

describe("shareJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when sharing is not supported", async () => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const result = await shareJson({ a: 1 }, "Test", "test.json");
    expect(result).toBe(false);
  });

  it("returns true when share succeeds", async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);
    const canShareFn = vi.fn().mockReturnValue(true);

    Object.defineProperty(navigator, "share", {
      value: shareFn,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: canShareFn,
      writable: true,
      configurable: true,
    });

    const result = await shareJson({ a: 1 }, "TestExam", "test.json");
    expect(result).toBe(true);
    expect(shareFn).toHaveBeenCalledOnce();
  });

  it("returns false when canShare rejects the data", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: vi.fn().mockReturnValue(false),
      writable: true,
      configurable: true,
    });

    const result = await shareJson({ x: 1 }, "Title", "file.json");
    expect(result).toBe(false);
  });

  it("returns false when share throws (user cancel)", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(new Error("AbortError")),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });

    const result = await shareJson({ x: 1 }, "Title", "file.json");
    expect(result).toBe(false);
  });
});
