/**
 * Page Text Updater — i18n DOM Text Synchronization
 *
 * Sets all translatable text content on the page.
 * Pure DOM manipulation — no business logic, no state.
 */

import type { Translations } from "../i18n/index.js";
import { APP_VERSION } from "../application/version.js";

/** Safely set text content by element ID */
function setText(id: string, text: string | undefined): void {
  const el = document.getElementById(id);
  if (el && text !== undefined) el.textContent = text;
}

/** Safely set innerHTML by element ID */
function setHtml(id: string, html: string | undefined): void {
  const el = document.getElementById(id);
  if (el && html !== undefined) el.innerHTML = html;
}

/**
 * Update all translatable text on the page from the provided translations.
 */
export function updatePageText(T: Translations): void {
  // Header
  setText("appTitle", T.appTitle);

  // Version footer
  setText(
    "versionFooter",
    (T.appVersionLabel ?? "GinaXams Player v{version}").replace(
      "{version}",
      APP_VERSION,
    ),
  );

  // Library screen
  setText("txtLoadExamFile", T.loadExamFile);
  setText("txtClickToSelect", T.clickToSelect);
  setText("txtAvailableExams", T.availableExams);
  setText("txtRefresh", T.refresh);
  setText("txtNewFolder", T.newFolder);
  setText("txtBackup", T.export);
  setText("txtRestore", T.import);

  // Set backup/restore button tooltips
  const btnBackup = document.getElementById("btnBackup");
  if (btnBackup) btnBackup.title = T.backupDescription ?? "";
  const btnRestore = document.getElementById("btnRestore");
  if (btnRestore) btnRestore.title = T.restoreDescription ?? "";

  // Navigation Tabs
  setText("txtTabLibrary", T.tabLibrary);
  setText("txtTabInsights", T.tabInsights);
  setText("txtTabTelemetry", T.tabTelemetry);

  // Options screen (mode selection)
  setText("txtOptions", T.options);
  setText("txtShuffleQuestions", T.shuffleQuestions);
  setText("txtShuffleAnswers", T.shuffleAnswers);
  setText("txtShowFeedback", T.showFeedback);
  setText("btnPracticeMode", T.practiceMode);
  setText("txtBackToMenu", `← ${T.backToLibrary || T.back}`);

  // Practice screen
  setText("txtExitReview", T.menu);
  setText("txtPrevious", T.previous);
  setText("txtNext", T.next);
  setText("txtFinish", T.finish);

  // Results screen
  setText("txtResults", T.results);
  setText("txtScoreSummary", T.scoreSummary);
  setText("txtResultCorrectLabel", T.correct);
  setText("txtResultWrongLabel", T.wrong);
  setText("txtResultBlankLabel", T.blank);
  setText("txtResultScoreLabel", T.score);
  setText("txtStatistics", T.statistics);
  setText("txtTotalQuestions", T.totalQuestions);
  setText("txtTimeSpent", T.timeSpent);
  setText("txtLastScore", T.lastScore);
  setText("txtBestScore", T.bestScore);
  setText("lblTryAgain", T.tryAgain);
  setText("lblReviewAnswers", T.reviewAnswers);
  setText("txtReviewSummaryTitle", T.reviewSummary);
  setText("txtBackToLibraryBtn", T.backToLibrary);

  // Review screen
  setText("txtBackReview", T.reviewBack || T.back);
  setText("txtFilterAll", T.filterAll);
  setText("txtFilterWrong", T.filterWrong);
  setText("txtCorrectAnswer", T.correctAnswer);
  setText("txtReviewPrevious", T.reviewPrev);
  setText("txtReviewNext", T.reviewNext);

  // Onboarding
  setText("txtOnboardingSkip", T.onboardingSkip);
  setText("txtOnboardingBack", T.onboardingBack);
  setText("txtOnboardingNext", T.onboardingNext);
  setText("txtOnboardingWelcomeTitle", T.onboardingWelcomeTitle);
  setText("txtOnboardingWelcomeText", T.onboardingWelcomeText);
  setText("txtOnboardingStorageTitle", T.onboardingStorageTitle);
  setText("txtOnboardingStorageText", T.onboardingStorageText);
  setText("txtOnboardingImportTitle", T.onboardingImportTitle);
  setText("txtOnboardingImportText", T.onboardingImportText);
  setText("txtOnboardingPracticeTitle", T.onboardingPracticeTitle);
  setText("txtOnboardingPracticeText", T.onboardingPracticeText);
  setText("txtOnboardingCreateTitle", T.onboardingCreateTitle);
  setText("txtOnboardingCreateText", T.onboardingCreateText);
  setText("txtOnboardingEasyTitle", T.onboardingEasyTitle);
  setText("txtOnboardingEasyDesc", T.onboardingEasyDesc);
  setText("txtOnboardingAdvancedTitle", T.onboardingAdvancedTitle);
  setText("txtOnboardingAdvancedDesc", T.onboardingAdvancedDesc);

  // Help
  setText("txtShowOnboarding", T.showOnboarding);
  setText("txtExamFormat", T.examFormat);
  setText("txtExamFormatBtn", T.createExamBtn || T.examFormat);

  // Template modal
  setText("txtExamFormatDesc", T.examFormatDesc);
  setText("txtUseWithAI", `💡 ${T.useWithAI}`);
  setText("txtAIHelpText", T.aiHelpText);
  setText("txtCopyTemplate", T.copyTemplate);
  setText("txtCopyInstead", T.copyInstead);
  setText("txtDownloadTemplate", `📥 ${T.downloadTemplate}`);

  // Choice modal
  setText("txtHowToCreate", T.howToCreate);
  setText("txtEasyWay", T.easyWay);
  setText("txtEasyWayDesc", T.easyWayDesc);
  setText("txtAdvancedWay", T.advancedWay);
  setText("txtAdvancedWayDesc", T.advancedWayDesc);

  // External link modal
  setText("txtLeavingSite", T.leavingSite);
  setText("txtExternalLinkConfirm", T.externalLinkConfirm);
  setText("txtStayHere", T.stayHere);
  setText("txtContinue", T.continue);

  // AI Prompt Generator
  setText("txtAIPromptTitle", T.aiPromptTitle);
  setText("txtAIPromptSubtitle", T.aiPromptSubtitle);
  setText("txtNumQuestionsLabel", T.numQuestionsLabel);
  setText("txtNumAnswersLabel", T.numAnswersLabel);
  setText("txtDifficultyLabel", T.difficultyLabel);
  setText("txtDifficultyEasy", T.difficultyEasy);
  setText("txtDifficultyMedium", T.difficultyMedium);
  setText("txtDifficultyHard", T.difficultyHard);
  setText("txtDifficultyMixed", T.difficultyMixed);
  setText("txtMaterialLabel", T.materialLabel);
  setText("txtGeneratePromptBtn", T.generatePromptBtn);
  setText("txtYourPrompt", T.yourPrompt);
  setText("txtCopyGeneratedPrompt", T.copyGeneratedPrompt);
  setText("txtNowPaste", T.nowPaste);
  setHtml("txtMaterialInChatLabel", T.materialInChatLabel);
  setHtml("txtNotebookSuggestion", T.notebookSuggestion);

  // Exam name & JSON paste
  setText("txtAiExamNameLabel", T.aiPromptExamName);
  setText("txtAttachSources", T.aiPromptAttachSources);
  setText("txtAiHaveResponse", T.aiHaveResponse);
  setText("txtAiOrDivider", T.aiOrDivider);
  setText("txtAiValidateBtn", T.aiValidateBtn);
  setText("txtAiImportBtn", T.aiImportBtn);
  setText("txtAiPreviewTitle", T.aiPreviewTitle);
  setText("txtAiPreviewQuestions", T.aiPreviewQuestions);
  setText("txtAiPreviewCategories", T.aiPreviewCategories);

  // Exam name input placeholder
  const aiExamName = document.getElementById(
    "aiExamName",
  ) as HTMLInputElement | null;
  if (aiExamName) {
    aiExamName.placeholder = T.aiPromptExamNamePlaceholder || "";
  }

  // JSON paste textarea placeholder
  const aiJsonPasteInput = document.getElementById(
    "aiJsonPasteInput",
  ) as HTMLTextAreaElement | null;
  if (aiJsonPasteInput) {
    aiJsonPasteInput.placeholder = T.aiPastePlaceholder || "";
  }

  // Set textarea placeholder via data attribute
  const aiMaterial = document.getElementById(
    "aiMaterial",
  ) as HTMLTextAreaElement | null;
  if (aiMaterial) {
    aiMaterial.placeholder = T.materialPlaceholder || "";
  }
}
