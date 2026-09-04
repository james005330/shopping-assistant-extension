const SNAPSHOT_PREFIX = "cartSnapshot:";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

function snapshotKey(tabId) {
  return `${SNAPSHOT_PREFIX}${tabId}`;
}

function readSnapshot(tabId, sendResponse) {
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, error: "Missing tab id." });
    return;
  }

  chrome.storage.session.get(snapshotKey(tabId), (result) => {
    sendResponse({ ok: true, snapshot: result[snapshotKey(tabId)] || null });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "CART_SNAPSHOT") {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) {
      sendResponse?.({ ok: false, error: "Message has no tab context." });
      return false;
    }

    const snapshot = {
      ...message.payload,
      tabId,
      receivedAt: new Date().toISOString()
    };

    chrome.storage.session.set({ [snapshotKey(tabId)]: snapshot }, () => {
      chrome.runtime.sendMessage({ type: "CART_SNAPSHOT_UPDATED", payload: snapshot }).catch(() => {});
      sendResponse?.({ ok: true });
    });

    return true;
  }

  if (message.type === "GET_LAST_SNAPSHOT") {
    readSnapshot(message.tabId, sendResponse);
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(snapshotKey(tabId));
});
