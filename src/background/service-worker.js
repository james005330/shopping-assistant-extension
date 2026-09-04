const SNAPSHOT_PREFIX = "cartSnapshot:";
const LAST_BAG_KEY = "lastBagSnapshot";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

function snapshotKey(tabId) {
  return `${SNAPSHOT_PREFIX}${tabId}`;
}

function isSupportedBagSnapshot(snapshot) {
  return snapshot?.site === "musinsa";
}

function readTabSnapshot(tabId, sendResponse) {
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, error: "Missing tab id." });
    return;
  }

  chrome.storage.session.get(snapshotKey(tabId), (result) => {
    sendResponse({ ok: true, snapshot: result[snapshotKey(tabId)] || null });
  });
}

function readLastBagSnapshot(sendResponse) {
  chrome.storage.local.get(LAST_BAG_KEY, (result) => {
    sendResponse({ ok: true, snapshot: result[LAST_BAG_KEY] || null });
  });
}

function publishSnapshot(snapshot, sendResponse) {
  const tabStorage = Number.isInteger(snapshot.tabId)
    ? chrome.storage.session.set({ [snapshotKey(snapshot.tabId)]: snapshot })
    : Promise.resolve();

  if (!isSupportedBagSnapshot(snapshot)) {
    Promise.resolve(tabStorage).then(() => {
      sendResponse?.({ ok: true, persisted: false });
    });
    return;
  }

  Promise.resolve(tabStorage).then(() => {
    chrome.storage.local.set({ [LAST_BAG_KEY]: snapshot }, () => {
      chrome.runtime.sendMessage({ type: "CART_SNAPSHOT_UPDATED", payload: snapshot }).catch(() => {});
      sendResponse?.({ ok: true, persisted: true });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "CART_SNAPSHOT") {
    const tabId = sender.tab?.id;
    const snapshot = {
      ...message.payload,
      tabId: Number.isInteger(tabId) ? tabId : null,
      receivedAt: new Date().toISOString()
    };

    publishSnapshot(snapshot, sendResponse);
    return true;
  }

  if (message.type === "GET_TAB_SNAPSHOT" || message.type === "GET_LAST_SNAPSHOT") {
    readTabSnapshot(message.tabId, sendResponse);
    return true;
  }

  if (message.type === "GET_LAST_BAG_SNAPSHOT") {
    readLastBagSnapshot(sendResponse);
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(snapshotKey(tabId));
});
