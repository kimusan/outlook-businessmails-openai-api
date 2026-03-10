/* global Office */

export interface ReplyContext {
  draftText: string;
  threadText: string;
}

const REPLY_MARKERS: RegExp[] = [
  /^\s*From:\s/m,
  /^\s*On .+wrote:\s*$/m,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*Von:\s/m,
  /^\s*Fra:\s/m,
  /^\s*보낸 사람:\s/m,
];

function fromAsyncResult<T>(
  callbackBased: (done: (result: Office.AsyncResult<T>) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    callbackBased((asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Succeeded) {
        resolve(asyncResult.value);
      } else {
        reject(new Error(asyncResult.error.message));
      }
    });
  });
}

function getMailboxItem(): Office.Item | null {
  if (typeof Office === "undefined" || !Office.context || !Office.context.mailbox) {
    return null;
  }

  return Office.context.mailbox.item;
}

export async function getCurrentBodyText(): Promise<string> {
  const item = getMailboxItem() as Office.MessageRead | Office.MessageCompose;
  if (!item || !item.body) {
    throw new Error("No Outlook message is available in current context.");
  }

  const value = await fromAsyncResult<string>((done) => {
    item.body.getAsync(Office.CoercionType.Text, done);
  });

  return value || "";
}

export async function getSelectedTextOrEmpty(): Promise<string> {
  const item = getMailboxItem() as any;
  if (!item || typeof item.getSelectedDataAsync !== "function") {
    return "";
  }

  try {
    const value = await fromAsyncResult<string>((done) => {
      item.getSelectedDataAsync(Office.CoercionType.Text, done);
    });

    return value || "";
  } catch {
    return "";
  }
}

export async function setComposeBodyText(text: string): Promise<void> {
  const item = getMailboxItem() as Office.MessageCompose;
  if (!item || !item.body || typeof item.body.setAsync !== "function") {
    throw new Error("Current context does not support replacing draft body text.");
  }

  await fromAsyncResult<void>((done) => {
    item.body.setAsync(text, { coercionType: Office.CoercionType.Text }, done);
  });
}

export async function insertTextAtCursor(text: string): Promise<void> {
  const item = getMailboxItem() as Office.MessageCompose;
  if (!item || !item.body || typeof item.body.setSelectedDataAsync !== "function") {
    throw new Error("Current context does not support text insertion at cursor.");
  }

  await fromAsyncResult<void>((done) => {
    item.body.setSelectedDataAsync(text, { coercionType: Office.CoercionType.Text }, done);
  });
}

export async function getComposeTypeOrUnknown(): Promise<string> {
  const item = getMailboxItem() as any;
  if (!item || typeof item.getComposeTypeAsync !== "function") {
    return "unknown";
  }

  try {
    const result: any = await fromAsyncResult<any>((done) => {
      item.getComposeTypeAsync(done);
    });

    if (result && typeof result.composeType === "string") {
      return result.composeType;
    }

    if (typeof result === "string") {
      return result;
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function splitDraftAndThread(bodyText: string): ReplyContext {
  if (!bodyText || bodyText.trim().length === 0) {
    return { draftText: "", threadText: "" };
  }

  let markerIndex = -1;

  REPLY_MARKERS.forEach((pattern) => {
    const match = pattern.exec(bodyText);
    if (!match || match.index < 0) {
      return;
    }

    if (markerIndex < 0 || match.index < markerIndex) {
      markerIndex = match.index;
    }
  });

  if (markerIndex < 0) {
    return {
      draftText: bodyText.trim(),
      threadText: "",
    };
  }

  return {
    draftText: bodyText.slice(0, markerIndex).trim(),
    threadText: bodyText.slice(markerIndex).trim(),
  };
}

export function limitWords(text: string, maxWords: number): string {
  if (!text) {
    return "";
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= maxWords) {
    return text;
  }

  return words.slice(0, maxWords).join(" ");
}
