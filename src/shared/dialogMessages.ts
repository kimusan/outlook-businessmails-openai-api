export interface ResultDialogPayload {
  type: "resultPayload";
  title: string;
  workflow: string;
  language: string;
  generatedAt: string;
  text: string;
}

export interface ResultDialogReadyMessage {
  type: "ready";
}

export interface ResultDialogCloseMessage {
  type: "close";
}

export type ResultDialogOutgoingMessage = ResultDialogReadyMessage | ResultDialogCloseMessage;
