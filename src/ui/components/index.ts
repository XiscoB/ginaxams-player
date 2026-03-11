/**
 * UI Components — Barrel export
 *
 * Re-exports all UI primitives for convenient importing.
 *
 * Usage:
 *   import { createCard, createBadge, createButton } from '../ui/components';
 */

export { createCard } from "./Card.js";
export type { CardOptions } from "./Card.js";

export { createBadge } from "./Badge.js";
export type { BadgeVariant, BadgeOptions } from "./Badge.js";

export { createButton } from "./Button.js";
export type { ButtonVariant, ButtonOptions } from "./Button.js";

export { createProgressBar } from "./ProgressBar.js";
export type { ProgressBarOptions } from "./ProgressBar.js";

export { createGauge } from "./Gauge.js";
export type { GaugeOptions } from "./Gauge.js";

export { createList } from "./List.js";
export type { ListOptions } from "./List.js";

export { createStack } from "./Stack.js";
export type { StackOptions } from "./Stack.js";

export { createSection } from "./Section.js";
export type { SectionOptions } from "./Section.js";

export {
  createLoadingIndicator,
  createErrorState,
  createViewLoading,
  createViewError,
} from "./ViewStatus.js";
export type {
  LoadingIndicatorOptions,
  ErrorStateOptions,
} from "./ViewStatus.js";

export { showConfirmModal, showAlertModal } from "./ConfirmModal.js";
export type {
  ConfirmModalVariant,
  ConfirmModalOptions,
} from "./ConfirmModal.js";

export { showInputModal } from "./InputModal.js";
export type { InputModalOptions } from "./InputModal.js";

export { showSelectModal } from "./SelectModal.js";
export type { SelectModalOption, SelectModalOptions } from "./SelectModal.js";
