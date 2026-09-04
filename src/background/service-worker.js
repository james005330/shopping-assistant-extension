const SNAPSHOT_PREFIX = "cartSnapshot:";
const BAG_SNAPSHOTS_KEY = "bagSnapshotsBySite";
const LEGACY_LAST_BAG_KEY = "lastBagSnapshot";
const SUPPORTED_SITES = new Set(["musinsa", "oliveyoung"]);
const SITE_ORDER = ["musinsa", "oliveyoung"];

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
  return SUPPORTED_SITES.has(snapshot?.site);
}

function normalizeItem(snapshot, item, index) {
  const sourceSite = item.sourceSite || snapshot.site;
  const rawId = item.id || item.url || item.name || String(index);
  return {
    ...item,
    sourceSite,
    sourceLabel: item.sourceLabel || snapshot.label,
    id: `${sourceSite}:${rawId}`
  };
}

function sortSnapshots(snapshots) {
  return snapshots.sort((a, b) => {
    const siteA = SITE_ORDER.indexOf(a.site);
    const siteB = SITE_ORDER.indexOf(b.site);
    return (siteA === -1 ? 999 : siteA) - (siteB === -1 ? 999 : siteB);
  });
}

function combinedBagSnapshot(snapshotsBySite) {
  const snapshots = sortSnapshots(Object.values(snapshotsBySite || {}).filter(isSupportedBagSnapshot));
  if (!snapshots.length) {
    return null;
  }

  const items = snapshots.flatMap((snapshot) =>
    (snapshot.items || []).map((item, index) => normalizeItem(snapshot, item, index))
  );
  const labels = snapshots.map((snapshot) => snapshot.label).filter(Boolean);
  const latestReceivedAt = snapshots
    .map((snapshot) => snapshot.receivedAt || snapshot.parsedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    site: "combined",
    label: labels.length ? labels.join(" + ") : "InMyCart",
    url: "",
    parsedAt: latestReceivedAt || new Date().toISOString(),
    receivedAt: latestReceivedAt || new Date().toISOString(),
    items,
    parserVersion: "combined-bag.v1",
    sources: snapshots.map((snapshot) => ({
      site: snapshot.site,
      label: snapshot.label,
      url: snapshot.url,
      parsedAt: snapshot.parsedAt,
      receivedAt: snapshot.receivedAt,
      count: snapshot.items?.length || 0,
      parserVersion: snapshot.parserVersion
    }))
  };
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

function readBagSnapshots(callback) {
  chrome.storage.local.get([BAG_SNAPSHOTS_KEY, LEGACY_LAST_BAG_KEY], (result) => {
    const current = result[BAG_SNAPSHOTS_KEY];
    const snapshotsBySite = current && typeof current === "object" && !Array.isArray(current)
      ? { ...current }
      : {};
    const legacy = result[LEGACY_LAST_BAG_KEY];

    if (isSupportedBagSnapshot(legacy) && !snapshotsBySite[legacy.site]) {
      snapshotsBySite[legacy.site] = legacy;
      chrome.storage.local.set({ [BAG_SNAPSHOTS_KEY]: snapshotsBySite });
    }

    callback(snapshotsBySite);
  });
}

function readLastBagSnapshot(sendResponse) {
  readBagSnapshots((snapshotsBySite) => {
    sendResponse({ ok: true, snapshot: combinedBagSnapshot(snapshotsBySite) });
  });
}

function writeTabSnapshot(snapshot, done) {
  if (!Number.isInteger(snapshot.tabId)) {
    done();
    return;
  }

  chrome.storage.session.set({ [snapshotKey(snapshot.tabId)]: snapshot }, done);
}

function publishSnapshot(snapshot, sendResponse) {
  writeTabSnapshot(snapshot, () => {
    if (!isSupportedBagSnapshot(snapshot)) {
      sendResponse?.({ ok: true, persisted: false, snapshot: null });
      return;
    }

    readBagSnapshots((snapshotsBySite) => {
      const nextSnapshots = {
        ...snapshotsBySite,
        [snapshot.site]: snapshot
      };
      const combined = combinedBagSnapshot(nextSnapshots);

      chrome.storage.local.set({
        [BAG_SNAPSHOTS_KEY]: nextSnapshots,
        [LEGACY_LAST_BAG_KEY]: snapshot
      }, () => {
        chrome.runtime.sendMessage({ type: "CART_SNAPSHOT_UPDATED", payload: combined }).catch(() => {});
        sendResponse?.({ ok: true, persisted: true, snapshot: combined });
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "CART_SNAPSHOT") {
    const senderTabId = sender.tab?.id;
    const payloadTabId = message.payload?.tabId;
    const tabId = Number.isInteger(senderTabId) ? senderTabId : payloadTabId;
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
