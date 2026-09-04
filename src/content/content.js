(function bootCartPeekContentScript() {
  let lastSignature = "";
  let lastSnapshot = null;
  let scheduled = null;

  function snapshotSignature(snapshot) {
    return JSON.stringify({
      url: snapshot.url,
      count: snapshot.items.length,
      items: snapshot.items.map((item) => [item.id, item.name, item.price, item.quantity])
    });
  }

  function sendSnapshot(snapshot) {
    lastSnapshot = snapshot;
    chrome.runtime.sendMessage({ type: "CART_SNAPSHOT", payload: snapshot }).catch(() => {});
  }

  function parseAndPublish() {
    scheduled = null;

    if (!window.CartParsers) {
      return;
    }

    const snapshot = window.CartParsers.parseCurrentPage();
    const signature = snapshotSignature(snapshot);
    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;
    sendSnapshot(snapshot);
  }

  function scheduleParse(delay = 250) {
    if (scheduled) {
      clearTimeout(scheduled);
    }
    scheduled = setTimeout(parseAndPublish, delay);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GET_CART_SNAPSHOT_FROM_PAGE") {
      return false;
    }

    parseAndPublish();
    sendResponse({ ok: true, snapshot: lastSnapshot });
    return false;
  });

  scheduleParse(300);

  const observer = new MutationObserver(() => scheduleParse(500));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener("pageshow", () => scheduleParse(1000));
})();
