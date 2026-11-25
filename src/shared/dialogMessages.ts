export interface ResultDialogPayload {
  type: "resultPayload";
  title: string;
  workflow: string;
  language: string;
  generatedAt: string;
  text: string;
}

/*
 * Live translated view (read mode): the dialog receives a sanitized copy of
 * the original mail body and then applies translations incrementally as
 * batches return, flashing each translated segment (dstranslator-style).
 */
export interface TranslationViewPayload {
  type: "translationView";
  title: string;
  workflow: string;
  language: string;
  generatedAt: string;
  /** Escaped notes shown above the mail copy (e.g. "Translated view — ..."). */
  noteHtml: string;
  /** Escaped original subject; may be empty. */
  subjectHtml: string;
  /** Sanitized serialized original mail body (full document string). */
  html: string;
  totalSegments: number;
  batchCount: number;
  skippedQuotedChain: boolean;
}

/*
 * Incremental update for the live translated view. The mapping always
 * carries the FULL set of translations so far, so a lost update is healed
 * by the next one; the dialog applies only ids it has not applied yet.
 */
export interface TranslationUpdatePayload {
  type: "translationUpdate";
  mapping: Record<string, string[]>;
  translatedCount: number;
  keptOriginalCount: number;
  batchDone: number;
  batchCount: number;
  /** Escaped translated subject; arrives with the first batch. */
  subjectHtml?: string;
  finished?: boolean;
  cancelled?: boolean;
}

export type ResultDialogIncomingMessage =
  | ResultDialogPayload
  | TranslationViewPayload
  | TranslationUpdatePayload;

export interface ResultDialogReadyMessage {
  type: "ready";
}

export interface ResultDialogCloseMessage {
  type: "close";
}

export type ResultDialogOutgoingMessage = ResultDialogReadyMessage | ResultDialogCloseMessage;
