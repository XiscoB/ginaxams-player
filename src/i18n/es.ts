/**
 * Spanish translations
 */

export const LANG_ES = {
  appTitle: "GinaXams Player",
  practiceModeSubtitle: "Modo Práctica",
  availableExams: "📚 Exámenes Disponibles",
  refresh: "↻ Actualizar",
  loadExamFile: "📁 Cargar Archivo de Examen",
  clickToSelect: "Haz clic para seleccionar example_exam.json",
  dragAndDrop: "O arrastra y suelta el archivo JSON aquí",
  orLoadManually: "o cargar manualmente",
  loading: "Cargando...",
  noExamsFound: "No se encontraron exámenes.",
  runScriptHint:
    "Importa cualquier archivo JSON de examen compatible para comenzar.",

  // Options
  options: "Opciones",
  shuffleQuestions: "Aleatorizar preguntas",
  shuffleAnswers: "Aleatorizar respuestas",
  showFeedback: "Mostrar corrección tras responder",

  // Modes
  practiceMode: "▶️ Práctica",
  reviewMode: "📖 Repasar Todo",
  selectMode: "Selecciona Modo de Práctica",
  freeMode: "Modo Libre",
  freeModeDesc: "Practica a tu ritmo con el examen completo",
  simulacroMode: "Simulacro",
  simulacroModeDesc: "Simulación de examen con tiempo",
  reviewModeDesc: "Enfócate en las preguntas débiles",

  // Stats
  questions: "preguntas",
  originalScore: "Puntuación original",
  practiceScore: "Tu puntuación",
  bestScore: "Mejor Puntuación",
  mainMenu: "Menú Principal",

  // Exam List
  exam: "examen",
  exams: "exámenes",

  // Navigation
  previous: "← Anterior",
  next: "Siguiente →",
  tryAgain: "Intentar de nuevo",
  reviewAnswers: "Repasar Respuestas",

  // Review
  filterAll: "Todas",
  filterWrong: "❌ Falladas",
  correctAnswer: "¡Correcto!",
  noQuestionsMatch: "¡Ninguna pregunta coincide con este filtro!",
  noWrongAnswers: "No hay respuestas incorrectas para repasar",

  // Status
  originallyCorrect: "✓ Originalmente correcta",
  originallyWrong: "✗ Originalmente incorrecta",
  mastered: "✓ Dominada",
  needsPractice: "✗ Necesita práctica",

  // Results
  results: "🏆 Resultados",
  correctOutOf: "correctas de",

  // Alerts
  examNotFound: "Examen no encontrado:",
  errorLoading: "Error cargando archivo:",

  // Library Management
  newFolder: "Nueva Carpeta",
  delete: "Eliminar",
  move: "Mover",
  moveToFolder: "Mover a carpeta",
  export: "Copia de Seguridad",
  import: "Restaurar",
  folderName: "Nombre de Carpeta:",
  confirmDelete: "¿Eliminar examen?",
  confirmDeleteFolder: "Los exámenes se moverán a Sin categoría. ¿Continuar?",
  uncategorized: "Sin categoría",
  importFirst: "Importa un examen para comenzar.",

  // Navigation
  back: "Volver",
  menu: "Menú",

  // Practice UI
  question: "Pregunta",
  questionOf: "de",
  finish: "Finalizar",
  unknown: "Desconocida",

  // Library
  loadDemoData: "Cargar Datos Demo",
  loadExampleExam: "Cargar Examen de Ejemplo",
  clearData: "Borrar Todos los Datos",
  confirmClearData:
    "Esto eliminará TODOS los exámenes, carpetas y progreso. No se puede deshacer. ¿Estás seguro?",
  emptyFolder: "Carpeta vacía",

  // Errors
  errorCreatingFolder: "Error al crear carpeta",
  errorDeletingFolder: "Error al eliminar carpeta",
  errorDeletingExam: "Error al eliminar examen",
  importFailed: "Error al importar",
  importSuccessful: "Importación exitosa",
  folderNotFound: "Carpeta no encontrada",
  wrongAnswer: "Incorrecto",
  exportFailed: "Error al exportar",
  invalidExamFormat: "Formato de examen inválido",
  errorRenaming: "Error al renombrar",
  errorMovingExam: "Error al mover examen",
  errorLoadingExample: "Error al cargar examen de ejemplo",

  // Rename
  rename: "Renombrar",
  newName: "Nuevo nombre:",

  // Attempts / Results
  attempts: "intentos",
  attempt: "intento",
  backToLibrary: "📚 Volver a la Biblioteca",
  reviewSummary: "Resumen de Repaso",

  // Score Display
  lastScore: "Última Puntuación",
  notAttempted: "Sin intentos aún",

  // Template / Format Help
  help: "Ayuda",
  showHelp: "Mostrar Ayuda",
  hideHelp: "Ocultar Ayuda",
  examFormat: "Formato de Examen",
  examFormatDesc:
    "Los exámenes son archivos JSON con preguntas, respuestas y respuestas correctas.",
  downloadTemplate: "Descargar Plantilla de Ejemplo",
  copyTemplate: "Copiar JSON al Portapapeles",
  copied: "¡Copiado al portapapeles!",
  useWithAI: "Usar con IA",
  aiHelpText:
    "Puedes usar esta plantilla con herramientas de IA como NotebookLM, ChatGPT o Claude para crear tus propios exámenes. Solo copia el JSON de abajo y pégalo en el chat de IA, pidiéndole que cree preguntas en el mismo formato.",
  templateDownloaded: "¡Plantilla descargada!",
  copyInstead: "O copia el JSON directamente para pegarlo en un chat de IA",

  // Onboarding
  onboardingSkip: "Saltar",
  onboardingBack: "Atrás",
  onboardingNext: "Siguiente",
  onboardingFinish: "Comenzar",
  onboardingWelcomeTitle: "Bienvenido a GinaXams Player",
  onboardingWelcomeText:
    "Tu compañero personal para practicar exámenes. Importa exámenes, practica con diferentes modos y sigue tu progreso con el tiempo.",
  onboardingStorageTitle: "Tus Datos Son Privados",
  onboardingStorageText:
    "Todos tus exámenes, progreso y puntuaciones se almacenan solo en tu dispositivo para total privacidad. Usa ⬇ Copia de Seguridad para exportar tus datos y ⬆ Restaurar para importarlos en otro dispositivo.",
  onboardingCreateTitle: "Crea tu Examen",
  onboardingCreateText:
    "¿Listo para crear tu propio examen? Elige cómo quieres hacerlo:",
  onboardingEasyTitle: "Modo Fácil",
  onboardingEasyDesc:
    "Genera un prompt personalizado para IA con tus preferencias",
  onboardingAdvancedTitle: "Modo Avanzado",
  onboardingAdvancedDesc: "Ver y editar la plantilla JSON directamente",
  onboardingImportTitle: "Importa tus Exámenes",
  onboardingImportText:
    "Una vez que tengas tu archivo de examen (en formato JSON), haz clic en el área 📂 Cargar Archivo de Examen para cargarlo. ¡También puedes arrastrar y soltar archivos directamente!",
  onboardingPracticeTitle: "Practica y Aprende",
  onboardingPracticeText:
    "Usa el Modo Práctica para ponerte a prueba con preguntas mezcladas y sigue tus puntuaciones. Repasa tus errores con el filtro Falladas para enfocarte en lo que necesitas mejorar.",
  onboardingOrganizeTitle: "Mantente Organizado",
  onboardingOrganizeText:
    "Crea carpetas para organizar tus exámenes. Tu progreso y puntuaciones se guardan automáticamente para que puedas ver tu mejora con el tiempo.",

  // Help / Show Onboarding
  showOnboarding: "Ver Tutorial",

  // AI Prompt Generator
  orGeneratePrompt: "o genera un prompt personalizado para IA",
  generateAIPrompt: "Generar Prompt para IA",
  aiPromptTitle: "Generar Prompt para IA",
  aiPromptSubtitle:
    "Completa los detalles y crearemos el prompt perfecto para ti",
  numQuestionsLabel: "Número de preguntas",
  numAnswersLabel: "Respuestas por pregunta",
  difficultyLabel: "Nivel de dificultad",
  difficultyEasy: "Fácil",
  difficultyMedium: "Medio",
  difficultyHard: "Difícil",
  difficultyMixed: "Mixto (varios niveles)",
  materialLabel: "Tu material de estudio",
  materialPlaceholder:
    "Pega tus apuntes, contenido del libro de texto, o cualquier material del que quieras crear preguntas...",
  generatePromptBtn: "Generar Prompt",
  yourPrompt: "¡Tu prompt personalizado está listo!",
  copyAndPaste: "Copia este prompt y pégalo en",
  copyGeneratedPrompt: "Copiar Prompt",
  aiPromptNoMaterial: "¡Por favor introduce tu material de estudio primero!",
  materialInChatLabel:
    "<strong>Tengo el material como archivo.</strong> Lo pegaré directamente en el chat de la IA después del prompt.",
  // AI Prompt body (generated prompt text)
  aiPromptBody:
    "Basándome en el siguiente material de estudio, quiero que me generes un examen de opción múltiple con {numQuestions} preguntas. Cada pregunta debe tener {numAnswers} respuestas posibles (etiquetadas {letters}), con UNA sola respuesta correcta por pregunta.",
  aiPromptSchemaNote: "Por favor genera un objeto JSON en este formato exacto:",
  aiPromptRules: `REQUISITOS IMPORTANTES:
1. Las preguntas deben evaluar comprensión, no solo memorización
2. Los distractores (respuestas incorrectas) deben ser plausibles
3. Incluye una mezcla de tipos de preguntas (conceptuales, aplicación, análisis)
4. Asegúrate de que las preguntas correspondan al nivel de dificultad: {difficulty}
5. Solo UNA respuesta por pregunta debe tener "isCorrect": true
6. Devuelve SOLO el JSON, sin formato markdown ni explicaciones`,
  aiPromptMaterialBelow: "Material de estudio del que crear preguntas:",
  aiPromptMaterialNext:
    "[Pegaré el material de estudio en el siguiente mensaje]",
  aiPromptLanguage: "español",
  kimiSuggestion:
    "💡 <strong>Consejo:</strong> Este prompt fue pensado para usar con <a href='#' onclick='window.app.openExternalLink(\"https://kimi.moonshot.cn\", \"Kimi\"); return false;'>Kimi AI</a> - ¡pruébalo para obtener mejores resultados!",

  // Choice Modal
  howToCreate: "¿Cómo quieres crear tu examen?",
  easyWay: "Modo Fácil",
  easyWayDesc:
    "Genera un prompt personalizado para IA. Solo completa tus preferencias y pégalo en cualquier asistente de IA.",
  advancedWay: "Modo Avanzado",
  advancedWayDesc:
    "Ver la plantilla JSON directamente. Para usuarios familiarizados con editar código.",

  // External Link Modal
  leavingSite: "Estás a punto de salir de GinaXams Player",
  externalLinkConfirm: "Serás redirigido a:",
  stayHere: "Quedarme Aquí",
  continue: "Continuar",

  // AI Destinations
  nowPaste: "Ahora pégalo en tu IA favorita:",

  // Exam Name & JSON Paste
  aiPromptExamName: "Nombre del examen",
  aiPromptExamNamePlaceholder: "ej. Derecho Constitucional 2026",
  aiPromptExamNameRequired: "Por favor introduce un nombre para el examen.",
  aiPromptExamNameDuplicate:
    "Ya existe un examen con este nombre. Se sobrescribirá si lo importas.",
  confirmOverwriteExam:
    'Ya existe un examen con ID "{examId}" ("{title}"). ¿Quieres sobrescribirlo?',
  aiPromptAttachSources:
    "Adjunta tus archivos fuente o materiales de estudio directamente en el chat de la IA junto con este prompt.",
  aiHaveResponse: "Tengo la respuesta de la IA",
  aiPastePlaceholder: "Pega el JSON que generó la IA aquí...",
  aiValidateBtn: "Validar Examen",
  aiOrDivider: "o",
  aiImportBtn: "Importar Examen",
  aiJsonValid: "¡JSON de examen válido!",
  aiJsonInvalidJson: "JSON inválido: no se pudo analizar el texto.",
  aiJsonInvalidSchema: "Formato de examen inválido",
  aiImportSuccess: "¡Examen importado exitosamente!",
  aiPreviewTitle: "Título",
  aiPreviewQuestions: "Preguntas",
  aiPreviewCategories: "Categorías",
  createExamBtn: "Crear Examen",

  // Tarjeta Roja (Wrong Answer Feedback)
  referenceArticle: "Referencia",
  literalCitation: "Cita",
  explanation: "Explicación",

  // Results Screen
  scoreSummary: "Resumen de Puntuación",
  correct: "Correctas",
  wrong: "Incorrectas",
  blank: "Sin responder",
  score: "Puntuación",
  statistics: "Estadísticas",
  totalQuestions: "Total de Preguntas",
  timeSpent: "Tiempo Empleado",
  modeLabel: "Modo",
  modeFree: "Libre",
  modeSimulacro: "Simulacro",
  modeReview: "Repaso",

  // Review Screen Navigation
  reviewPrev: "← Anterior",
  reviewNext: "Siguiente →",
  reviewBack: "Volver",

  // Mode Card Descriptions
  modeFreeDescription: "Sin seguimiento de telemetría",
  modeSimulacroDescription: "Temporizador configurable",
  modeReviewDescription: "Práctica adaptativa",
  modeStartButton: "Iniciar",

  // Simulacro Timer Configuration
  timerConfig: "Duración del temporizador",
  timerNoLimit: "Sin temporizador",
  timer30: "30 minutos",
  timer60: "60 minutos",
  timer90: "90 minutos",
  questionCountLabel: "Número de preguntas",
  penaltyLabel: "Penalización por respuesta incorrecta",
  rewardLabel: "Recompensa por respuesta correcta",

  // Timer Visibility
  showTimer: "Mostrar Temporizador",
  hideTimer: "Ocultar Temporizador",

  // Simulacro Options
  showFeedbackToggle: "Mostrar retroalimentación durante el examen",

  // Review
  correctAnswerLabel: "Respuesta correcta",

  // Practice UX (Phase 13)
  flagQuestion: "Marcar",
  unflagQuestion: "Desmarcar",
  examSummary: "Resumen del Examen",
  answered: "Respondidas",
  unanswered: "Sin responder",
  flagged: "Marcadas",
  submitExam: "Entregar Examen",
  returnToQuestions: "Volver a las Preguntas",
  jumpToUnanswered: "Ir a Sin Responder",
  jumpToFlagged: "Ir a Marcadas",
  navigator: "Navegador",

  // Review UX (Phase 14)
  nextWrongQuestion: "Siguiente Incorrecta",
  nextBlankQuestion: "Siguiente Sin Responder",

  // Navigation Tabs (Phase 15.1)
  tabLibrary: "Biblioteca",
  tabInsights: "Análisis",
  tabTelemetry: "Telemetría",

  // Insights Dashboard (Phase 16)
  insightsTitle: "Análisis",
  insightsDescription: "Analíticas de entrenamiento y vistas diagnósticas.",
  insightsCategoryMastery: "Dominio por Categoría",
  insightsCategoryMasteryEmpty:
    "No hay datos de categorías. Importa exámenes para ver niveles de dominio.",
  insightsAccuracy: "Precisión",
  insightsQuestions: "Preguntas",
  insightsNoCategoryQuestions: "No hay preguntas en esta categoría.",
  insightsWeakQuestions: "Preguntas Débiles",
  insightsWeakQuestionsEmpty:
    "¡No se encontraron preguntas débiles. ¡Buen trabajo!",
  insightsAnswers: "Respuestas:",
  insightsExplanation: "Explicación:",
  insightsReference: "Referencia",
  insightsAllCategories: "Todas las categorías",
  insightsTrapQuestions: "Preguntas Trampa",
  insightsTrapQuestionsEmpty:
    "Aún no se han detectado preguntas trampa. ¡Sigue practicando!",
  insightsCategory: "Categoría",
  insightsFeedback: "Retroalimentación:",
  insightsCitation: "Cita:",
  insightsProgressTimeline: "Progreso",
  insightsProgressEmpty:
    "Aún no hay historial de intentos. Completa simulacros o repasos para seguir tu progreso.",
  insightsDifficultyDistribution: "Distribución de Dificultad",
  insightsDifficultyEasy: "Fácil",
  insightsDifficultyMedium: "Medio",
  insightsDifficultyHard: "Difícil",
  insightsTotalQuestions: "Total de preguntas",
  insightsNoDifficultyQuestions: "No hay preguntas en este nivel.",

  // Telemetry Dashboard (Phase 16)
  telemetryTitle: "Telemetría",
  telemetryDescription:
    "Analíticas de rendimiento por pregunta y comportamiento de aprendizaje.",
  telemetryQuestionPerformance: "Rendimiento por Pregunta",
  telemetryMostFailed: "Preguntas Más Falladas",
  telemetrySlowest: "Preguntas Más Lentas",
  telemetryUnseen: "Preguntas No Vistas",
  telemetryNoMatchingQuestions:
    "Ninguna pregunta coincide con los filtros actuales.",
  telemetryNoFailedQuestions: "Aún no hay preguntas falladas.",
  telemetryNoAttemptedQuestions: "Aún no se ha intentado ninguna pregunta.",
  telemetryAllAttempted: "¡Todas las preguntas han sido intentadas!",
  telemetryUnseenByCategory: "No vistas por categoría:",
  telemetryNeverPracticed: "Preguntas nunca practicadas",
  telemetryNever: "Nunca",

  // Telemetry Table Headers (Phase 16)
  telemetryColQuestion: "#",
  telemetryColCategory: "Categoría",
  telemetryColSeen: "Vistas",
  telemetryColCorrect: "Correctas",
  telemetryColWrong: "Incorrectas",
  telemetryColBlank: "En blanco",
  telemetryColAvgTime: "Tiempo med.",
  telemetryColLastSeen: "Última vez",
  telemetryColStability: "Estabilidad",

  // Telemetry Sort/Filter Labels (Phase 16)
  telemetrySortLabel: "Ordenar:",
  telemetrySortMostWrong: "Más falladas",
  telemetrySortMostSeen: "Más vistas",
  telemetrySortLeastSeen: "Menos vistas",
  telemetrySortSlowest: "Más lentas",
  telemetrySortRecent: "Vistas recientemente",
  telemetryFilterLabel: "Filtro:",
  telemetryFilterAll: "Todas",
  telemetryFilterSeen: "Vistas",
  telemetryFilterUnseen: "No vistas",
  telemetryCategoryLabel: "Categoría:",
  telemetryCategoryAll: "Todas las categorías",

  // Telemetry Empty State (Phase 16)
  telemetryEmptyTitle: "Aún no hay datos de telemetría.",
  telemetryEmptyMessage: "Practica preguntas para generar estadísticas.",

  // Telemetry Detail Labels (Phase 16)
  telemetryWrongCount: "Incorrectas",
  telemetrySeenCount: "Vistas",
  telemetryAvgTimeLabel: "Tiempo med.",

  // Loading & Error States (Phase 17)
  loadingInsights: "Cargando análisis…",
  loadingTelemetry: "Cargando telemetría…",
  errorGenericTitle: "Algo salió mal.",
  errorReload: "Recargar",
  appVersionLabel: "GinaXams Player v{version}",

  // Shared Badge Labels (Phase 18)
  questionPrefix: "P",
  stabilityStable: "estable",
  stabilityUnstable: "inestable",
  stabilityUnlearned: "no aprendida",
  stabilityUnseen: "no vista",
  masteryWeak: "débil",
  masteryLearning: "aprendiendo",
  masteryMastered: "dominada",
  weaknessPrefix: "D",
  trapPrefix: "trampa",
  trapPossible: "posible",
  trapConfirmed: "confirmada",
  locale: "es",
} as const;
