import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LibraryFlowController,
  type LibraryFlowDeps,
} from "../LibraryFlowController.js";
import { DuplicateExamError } from "../../../application/examLibraryController.js";

const {
  renderLibraryListMock,
  showConfirmModalMock,
  showAlertModalMock,
} = vi.hoisted(() => ({
  renderLibraryListMock: vi.fn(),
  showConfirmModalMock: vi.fn(),
  showAlertModalMock: vi.fn(),
}));

vi.mock("../../../application/examLibraryController.js", () => {
  class MockDuplicateExamError extends Error {
    public readonly examId: string;
    public readonly existingTitle: string;

    constructor(examId: string, existingTitle: string) {
      super(`Duplicate exam_id: "${examId}" (existing: "${existingTitle}")`);
      this.name = "DuplicateExamError";
      this.examId = examId;
      this.existingTitle = existingTitle;
    }
  }

  return {
    DuplicateExamError: MockDuplicateExamError,
  };
});

vi.mock("../../../ui/views/LibraryView.js", () => ({
  renderLibraryList: renderLibraryListMock,
  renderExamExportMenu: vi.fn(),
}));

vi.mock("../../../ui/components/ConfirmModal.js", () => ({
  showConfirmModal: showConfirmModalMock,
  showAlertModal: showAlertModalMock,
}));

function createDeps(overrides?: {
  importExam?: ReturnType<typeof vi.fn>;
  getLibraryViewState?: ReturnType<typeof vi.fn>;
}): LibraryFlowDeps {
  const importExam = overrides?.importExam ?? vi.fn().mockResolvedValue("id-1");
  const getLibraryViewState =
    overrides?.getLibraryViewState ??
    vi.fn().mockResolvedValue({
      folders: [{ id: "folder-1", name: "Folder 1", examCount: 1 }],
      exams: [
        {
          id: "exam-1",
          title: "Exam 1",
          questionCount: 10,
          categories: ["A"],
          folderId: "folder-1",
          stats: { attemptCount: 0, bestScore: 0 },
        },
      ],
      uncategorizedExams: [],
    });

  return {
    libraryController: {
      getLibraryViewState,
      importExam,
    } as unknown as LibraryFlowDeps["libraryController"],
    settingsService: {
      setLastOpenedTab: vi.fn().mockResolvedValue(undefined),
    } as unknown as LibraryFlowDeps["settingsService"],
    getTranslations: () => ({
      importSuccessful: "Import successful",
      importFailed: "Import failed",
      importBatchSummary:
        "Processed {total} files: {imported} imported, {skipped} skipped, {failed} failed.",
      confirmOverwriteExam:
        'An exam with ID "{examId}" already exists ("{title}"). Do you want to overwrite it?',
      overwrite: "Overwrite",
      cancel: "Cancel",
      uncategorized: "Uncategorized",
      rename: "Rename",
      delete: "Delete",
      move: "Move",
      exportExam: "Export",
      bestScore: "Best Score",
      questions: "questions",
      attempts: "attempts",
      attempt: "attempt",
      noExamsFound: "No exams",
      importFirst: "Import first",
      loadExampleExam: "Load example",
    }) as unknown as ReturnType<LibraryFlowDeps["getTranslations"]>,
    setView: vi.fn(),
    selectExam: vi.fn(),
  };
}

function mockNodeDocumentWithExamList(): void {
  Object.defineProperty(globalThis, "document", {
    value: {
      getElementById: (id: string) => {
        if (id === "examList") return { innerHTML: "" };
        return null;
      },
    },
    configurable: true,
  });
}

describe("LibraryFlowController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNodeDocumentWithExamList();
  });

  afterEach(() => {
    // Keep test isolation when stubbing global document.
    Reflect.deleteProperty(globalThis, "document");
  });

  describe("folder collapse state", () => {
    it("toggles collapsed state for a folder", async () => {
      const deps = createDeps();
      const controller = new LibraryFlowController(deps);

      await controller.refreshLibrary();
      expect(renderLibraryListMock).toHaveBeenCalledTimes(1);

      const callbacks = renderLibraryListMock.mock.calls[0][3] as {
        isFolderCollapsed: (folderId: string) => boolean;
        onToggleFolderCollapse: (folderId: string) => void;
      };

      expect(callbacks.isFolderCollapsed("folder-1")).toBe(false);

      callbacks.onToggleFolderCollapse("folder-1");
      expect(renderLibraryListMock).toHaveBeenCalledTimes(2);
      expect(callbacks.isFolderCollapsed("folder-1")).toBe(true);

      callbacks.onToggleFolderCollapse("folder-1");
      expect(renderLibraryListMock).toHaveBeenCalledTimes(3);
      expect(callbacks.isFolderCollapsed("folder-1")).toBe(false);
    });

    it("prunes collapsed state when folder disappears", async () => {
      const getLibraryViewState = vi
        .fn()
        .mockResolvedValueOnce({
          folders: [{ id: "folder-1", name: "Folder 1", examCount: 1 }],
          exams: [
            {
              id: "exam-1",
              title: "Exam 1",
              questionCount: 10,
              categories: ["A"],
              folderId: "folder-1",
            },
          ],
          uncategorizedExams: [],
        })
        .mockResolvedValueOnce({
          folders: [],
          exams: [],
          uncategorizedExams: [],
        });

      const deps = createDeps({ getLibraryViewState });
      const controller = new LibraryFlowController(deps);

      await controller.refreshLibrary();
      const callbacksBefore = renderLibraryListMock.mock.calls[0][3] as {
        isFolderCollapsed: (folderId: string) => boolean;
        onToggleFolderCollapse: (folderId: string) => void;
      };

      callbacksBefore.onToggleFolderCollapse("folder-1");
      expect(callbacksBefore.isFolderCollapsed("folder-1")).toBe(true);

      await controller.refreshLibrary();
      const callbacksAfter = renderLibraryListMock.mock.calls[2][3] as {
        isFolderCollapsed: (folderId: string) => boolean;
      };

      expect(callbacksAfter.isFolderCollapsed("folder-1")).toBe(false);
    });
  });

  describe("multi-file import", () => {
    it("shows aggregated warning summary for mixed success/failure batch", async () => {
      const importExam = vi
        .fn()
        .mockResolvedValueOnce("exam-1")
        .mockRejectedValueOnce(new Error("Invalid JSON"));

      const deps = createDeps({ importExam });
      const controller = new LibraryFlowController(deps);

      const fileA = {
        name: "a.json",
        text: vi.fn().mockResolvedValue('{"schema_version":"2.0","title":"A"}'),
      } as unknown as File;
      const fileB = {
        name: "b.json",
        text: vi.fn().mockResolvedValue('{"schema_version":"2.0","title":"B"}'),
      } as unknown as File;

      await controller.handleFileImport([fileA, fileB]);

      expect(importExam).toHaveBeenCalledTimes(2);
      expect(showAlertModalMock).toHaveBeenCalledTimes(1);
      expect(showAlertModalMock.mock.calls[0][2]).toBe("warning");
      expect(showAlertModalMock.mock.calls[0][1]).toContain(
        "Processed 2 files: 1 imported, 0 skipped, 1 failed.",
      );
    });

    it("asks overwrite on duplicate and counts skipped when declined", async () => {
      const importExam = vi
        .fn()
        .mockRejectedValueOnce(new DuplicateExamError("exam-a", "Existing A"));
      showConfirmModalMock.mockResolvedValueOnce(false);

      const deps = createDeps({ importExam });
      const controller = new LibraryFlowController(deps);

      const dupFile = {
        name: "dup.json",
        text: vi
          .fn()
          .mockResolvedValue('{"schema_version":"2.0","exam_id":"exam-a","title":"A"}'),
      } as unknown as File;

      await controller.handleFileImport([dupFile]);

      expect(showConfirmModalMock).toHaveBeenCalledTimes(1);
      expect(importExam).toHaveBeenCalledTimes(1);
      expect(showAlertModalMock).toHaveBeenCalledTimes(1);
      expect(showAlertModalMock.mock.calls[0][1]).toContain(
        "Processed 1 files: 0 imported, 1 skipped, 0 failed.",
      );
      expect(showAlertModalMock.mock.calls[0][2]).toBe("success");
    });

    it("retries duplicate import with overwrite=true when confirmed", async () => {
      const importExam = vi
        .fn()
        .mockRejectedValueOnce(new DuplicateExamError("exam-a", "Existing A"))
        .mockResolvedValueOnce("exam-a");
      showConfirmModalMock.mockResolvedValueOnce(true);

      const deps = createDeps({ importExam });
      const controller = new LibraryFlowController(deps);

      const dupFile = {
        name: "dup.json",
        text: vi
          .fn()
          .mockResolvedValue('{"schema_version":"2.0","exam_id":"exam-a","title":"A"}'),
      } as unknown as File;

      await controller.handleFileImport([dupFile]);

      expect(importExam).toHaveBeenCalledTimes(2);
      expect(importExam.mock.calls[1][2]).toBe(true);
      expect(showAlertModalMock).toHaveBeenCalledTimes(1);
      expect(showAlertModalMock.mock.calls[0][2]).toBe("success");
    });
  });
});
