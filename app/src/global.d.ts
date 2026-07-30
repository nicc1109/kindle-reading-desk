import type { ReadingDeskApi } from "../shared/types";

declare global {
  interface Window {
    readingDesk?: ReadingDeskApi;
  }
}

export {};

