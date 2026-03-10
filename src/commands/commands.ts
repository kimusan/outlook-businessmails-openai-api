/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global global, Office, self, window */

Office.onReady(() => {
  // Office.js is ready.
});

/**
 * Compose quick action callback.
 * This no longer calls an AI endpoint directly, and guides the user to the task pane workflows.
 */
function action(event: Office.AddinCommands.Event) {
  const item = Office.context.mailbox.item as Office.MessageCompose;

  if (item && item.notificationMessages) {
    item.notificationMessages.replaceAsync("OutlookAiAssistantInfo", {
      type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
      message: "Open AI Assistant pane to draft, improve, or translate this email.",
      icon: "Icon.80x80",
      persistent: false,
    });
  }

  event.completed();
}

function getGlobal() {
  return typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
      ? window
      : typeof global !== "undefined"
        ? global
        : undefined;
}

const g = getGlobal() as any;

g.action = action;
