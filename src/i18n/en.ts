/**
 * English translations
 */

export const LANG_EN = {
  appTitle: "GinaXams Player",
  practiceModeSubtitle: "Practice Mode",
  availableExams: "📚 Available Exams",
  refresh: "↻ Refresh",
  loadExamFile: "📁 Load Exam File",
  clickToSelect: "Click to select example_exam.json",
  dragAndDrop: "Or drag and drop the JSON file here",
  orLoadManually: "or load manually",
  loading: "Loading...",
  noExamsFound: "No exams found.",
  runScriptHint: "Import any compatible exam JSON file to start practicing.",

  // Options
  options: "Options",
  shuffleQuestions: "Shuffle questions",
  shuffleAnswers: "Shuffle answers",
  showFeedback: "Show feedback after each answer",

  // Modes
  practiceMode: "▶️ Practice",
  reviewMode: "📖 Review All",
  selectMode: "Select Practice Mode",
  freeMode: "Free Mode",
  freeModeDesc: "Practice at your own pace with full exam",
  simulacroMode: "Simulacro",
  simulacroModeDesc: "Timed exam simulation",
  reviewModeDesc: "Focus on weak questions",

  // Stats
  questions: "questions",
  originalScore: "Original score",
  practiceScore: "Your practice score",
  bestScore: "Best Score",
  mainMenu: "Main Menu",

  // Exam List
  exam: "exam",
  exams: "exams",

  // Navigation
  previous: "← Previous",
  next: "Next →",
  tryAgain: "Try Again",
  reviewAnswers: "Review Answers",

  // Review
  filterAll: "All",
  filterWrong: "❌ Wrong",
  correctAnswer: "Correct!",
  noQuestionsMatch: "No questions match this filter!",
  noWrongAnswers: "No wrong answers to review",

  // Status
  originallyCorrect: "✓ Originally correct",
  originallyWrong: "✗ Originally wrong",
  mastered: "✓ Mastered",
  needsPractice: "✗ Needs practice",

  // Results
  results: "🏆 Results",
  correctOutOf: "correct out of",

  // Alerts
  examNotFound: "Exam not found:",
  errorLoading: "Error loading file:",

  // Library Management
  newFolder: "New Folder",
  delete: "Delete",
  move: "Move",
  moveToFolder: "Move to folder",
  export: "Backup",
  import: "Restore",
  folderName: "Folder Name:",
  confirmDelete: "Delete exam?",
  confirmDeleteFolder: "Exams will be moved to Uncategorized. Continue?",
  uncategorized: "Uncategorized",
  importFirst: "Import an exam to start.",

  // Navigation
  back: "Back",
  menu: "Menu",

  // Practice UI
  question: "Question",
  questionOf: "of",
  finish: "Finish",
  unknown: "Unknown",

  // Library
  loadDemoData: "Load Demo Data",
  loadExampleExam: "Load Example Exam",
  clearData: "Clear All Data",
  confirmClearData:
    "This will delete ALL exams, folders and progress. This cannot be undone. Are you sure?",
  emptyFolder: "Empty folder",

  // Errors
  errorCreatingFolder: "Failed to create folder",
  errorDeletingFolder: "Failed to delete folder",
  errorDeletingExam: "Failed to delete exam",
  importFailed: "Import failed",
  importSuccessful: "Import successful",
  folderNotFound: "Folder not found",
  wrongAnswer: "Incorrect",
  exportFailed: "Export failed",
  invalidExamFormat: "Invalid exam format: missing 'questions' array.",
  errorRenaming: "Failed to rename",
  errorMovingExam: "Failed to move exam",
  errorLoadingExample: "Failed to load example exam",

  // Rename
  rename: "Rename",
  newName: "New name:",

  // Attempts / Results
  attempts: "attempts",
  attempt: "attempt",
  backToLibrary: "📚 Back to Library",
  reviewSummary: "Review Summary",

  // Score Display
  lastScore: "Last Score",
  notAttempted: "Not attempted yet",

  // Template / Format Help
  help: "Help",
  showHelp: "Show Help",
  hideHelp: "Hide Help",
  examFormat: "Exam Format",
  examFormatDesc:
    "Exams are JSON files with questions, answers and correct answers.",
  downloadTemplate: "Download Example Template",
  copyTemplate: "Copy JSON to Clipboard",
  copied: "Copied to clipboard!",
  useWithAI: "Use with AI",
  aiHelpText:
    "You can use this template with AI tools like NotebookLM, ChatGPT or Claude to create your own exams. Just copy the JSON below and paste it to the AI, asking it to create questions in the same format.",
  templateDownloaded: "Template downloaded!",
  copyInstead: "Or copy the JSON directly to paste into an AI chat",

  // Onboarding
  onboardingSkip: "Skip",
  onboardingBack: "Back",
  onboardingNext: "Next",
  onboardingFinish: "Get Started",
  onboardingWelcomeTitle: "Welcome to GinaXams Player",
  onboardingWelcomeText:
    "Your personal exam practice companion. Import exams, practice with different modes, and track your progress over time.",
  onboardingStorageTitle: "Your Data Stays Private",
  onboardingStorageText:
    "All your exams, progress and scores are stored only on your device for complete privacy. Use ⬇ Backup to export your data and ⬆ Restore to import it on another device.",
  onboardingCreateTitle: "Create Your First Exam",
  onboardingCreateText:
    "Ready to create your own exam? Choose how you want to do it:",
  onboardingEasyTitle: "Easy Way",
  onboardingEasyDesc: "Generate a custom AI prompt with your preferences",
  onboardingAdvancedTitle: "Advanced Way",
  onboardingAdvancedDesc: "View and edit the JSON template directly",
  onboardingImportTitle: "Import Your Exams",
  onboardingImportText:
    "Once you have your exam file (in JSON format), click the 📂 Import Exam area to load it. You can also drag & drop files directly!",
  onboardingPracticeTitle: "Practice & Learn",
  onboardingPracticeText:
    "Use Practice Mode to test yourself with shuffled questions and track your scores. Review your mistakes with the Wrong filter to focus on what needs improvement.",
  onboardingOrganizeTitle: "Stay Organized",
  onboardingOrganizeText:
    "Create folders to organize your exams. Your progress and scores are automatically saved so you can see your improvement over time.",

  // Help / Show Onboarding
  showOnboarding: "Show Tutorial",

  // AI Prompt Generator
  orGeneratePrompt: "or generate a custom AI prompt",
  generateAIPrompt: "Generate AI Prompt",
  aiPromptTitle: "Generate AI Prompt",
  aiPromptSubtitle:
    "Fill in the details and we'll create a perfect prompt for you",
  numQuestionsLabel: "Number of questions",
  numAnswersLabel: "Answers per question",
  difficultyLabel: "Difficulty level",
  difficultyEasy: "Easy",
  difficultyMedium: "Medium",
  difficultyHard: "Hard",
  difficultyMixed: "Mixed (varied levels)",
  materialLabel: "Your study material",
  materialPlaceholder:
    "Paste your notes, textbook content, or any material you want to create questions from...",
  generatePromptBtn: "Generate Prompt",
  yourPrompt: "Your custom prompt is ready!",
  copyAndPaste: "Copy this prompt and paste it into",
  copyGeneratedPrompt: "Copy Prompt",
  aiPromptNoMaterial: "Please enter your study material first!",
  materialInChatLabel:
    "<strong>I have the material as a file.</strong> I'll paste it directly in the AI chat after the prompt.",
  kimiSuggestion:
    "💡 <strong>Tip:</strong> This prompt was generated with <a href='#' onclick='window.app.openExternalLink(\"https://kimi.moonshot.cn\", \"Kimi\"); return false;'>Kimi AI</a> in mind - give it a try for even better results!",

  // Choice Modal
  howToCreate: "How do you want to create your exam?",
  easyWay: "Easy Way",
  easyWayDesc:
    "Generate a custom AI prompt. Just fill in your preferences and paste it to any AI assistant.",
  advancedWay: "Advanced Way",
  advancedWayDesc:
    "View the JSON template directly. For users comfortable with editing code.",

  // External Link Modal
  leavingSite: "You're about to leave GinaXams Player",
  externalLinkConfirm: "You'll be redirected to:",
  stayHere: "Stay Here",
  continue: "Continue",

  // AI Destinations
  nowPaste: "Now paste it into your favorite AI:",

  // Tarjeta Roja (Wrong Answer Feedback)
  referenceArticle: "Reference",
  literalCitation: "Citation",
  explanation: "Explanation",

  // Results Screen
  scoreSummary: "Score Summary",
  correct: "Correct",
  wrong: "Wrong",
  blank: "Blank",
  score: "Score",
  statistics: "Statistics",
  totalQuestions: "Total Questions",
  timeSpent: "Time Spent",
  modeLabel: "Mode",
  modeFree: "Free",
  modeSimulacro: "Simulacro",
  modeReview: "Review",

  // Review Screen Navigation
  reviewPrev: "← Prev",
  reviewNext: "Next →",
  reviewBack: "Back",

  // Mode Card Descriptions
  modeFreeDescription: "No telemetry tracking",
  modeSimulacroDescription: "Configurable timer",
  modeReviewDescription: "Adaptive practice",
  modeStartButton: "Start",

  // Simulacro Timer Configuration
  timerConfig: "Timer Duration",
  timerNoLimit: "No timer",
  timer30: "30 minutes",
  timer60: "60 minutes",
  timer90: "90 minutes",
  questionCountLabel: "Question Count",
  penaltyLabel: "Penalty per wrong answer",
  rewardLabel: "Reward per correct answer",

  // Timer Visibility
  showTimer: "Show Timer",
  hideTimer: "Hide Timer",

  // Simulacro Options
  showFeedbackToggle: "Show feedback during exam",

  // Review
  correctAnswerLabel: "Correct answer",

  // Practice UX (Phase 13)
  flagQuestion: "Flag",
  unflagQuestion: "Unflag",
  examSummary: "Exam Summary",
  answered: "Answered",
  unanswered: "Unanswered",
  flagged: "Flagged",
  submitExam: "Submit Exam",
  returnToQuestions: "Return to Questions",
  jumpToUnanswered: "Jump to Unanswered",
  jumpToFlagged: "Jump to Flagged",
  navigator: "Navigator",

  // Review UX (Phase 14)
  nextWrongQuestion: "Next Wrong",
  nextBlankQuestion: "Next Blank",

  // Navigation Tabs (Phase 15.1)
  tabLibrary: "Library",
  tabInsights: "Insights",
  tabTelemetry: "Telemetry",
};

export type TranslationKey = keyof typeof LANG_EN;
