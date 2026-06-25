// Global type declarations for the haha project

/** MACRO object injected by preload.ts via Object.assign(globalThis, { MACRO: {...} }) */
declare const MACRO: {
  VERSION: string;
  PACKAGE_URL: string;
  NATIVE_PACKAGE_URL: string;
  BUILD_TIME: string;
  FEEDBACK_CHANNEL: string;
  VERSION_CHANGELOG: string;
  ISSUES_EXPLAINER: string;
};

// lodash-es module declarations (no @types/lodash-es available for ES modules)
declare module 'lodash-es/memoize.js' {
  import { memoize } from 'lodash-es';
  export default memoize;
}

declare module 'lodash-es' {
  export function memoize<T extends (...args: any[]) => any>(fn: T): T;
  export function debounce<T extends (...args: any[]) => any>(fn: T, wait: number): T;
  export function throttle<T extends (...args: any[]) => any>(fn: T, wait: number): T;
}
