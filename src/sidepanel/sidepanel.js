const state = {
  activeTabId: null,
  snapshot: null
};

const elements = {
  status: document.querySelector("#status"),
  itemCount: document.querySelector("#itemCount"),
  knownPriceCount: document.querySelector("#knownPriceCount"),
  insights: document.querySelector("#insights"),
  parserLabel: document.querySelector("#parserLabel"),
  itemsList: document.querySelector("#itemsList"),
  refreshButton: document.querySelector("#refreshButton"),
  itemTemplate: document.querySelector("#itemTemplate")
};

function setStatus(text, tone = "") {
  elements.status.textContent = text;
  if (tone) {
    elements.status.dataset.tone = tone;
  } else {
    delete elements.status.dataset.tone;
  }
}

function parseWon(price) {
  const match = String(price || "").match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function formatWon(value) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function buildInsights(snapshot) {
  const items = snapshot?.items || [];
  if (!items.length) {
    return ["상품을 읽어오면 이곳에 요약이 표시됩니다."];
  }

  const prices = items
    .map((item) => ({ item, value: parseWon(item.price) }))
    .filter((entry) => Number.isFinite(entry.value));

  const insights = [`총 ${items.length}개의 상품을 찾았습니다.`];

  if (prices.length) {
    const total = prices.reduce((sum, entry) => sum + entry.value * (entry.item.quantity || 1), 0);
    const highest = prices.reduce((max, entry) => entry.value > max.value ? entry : max, prices[0]);
    insights.push(`인식된 가격 기준 합계는 ${formatWon(total)}입니다.`);
    insights.push(`가장 비싼 상품은 ${highest.item.name || "이름 없는 상품"}입니다.`);
  } else {
    insights.push("가격 텍스트는 아직 안정적으로 찾지 못했습니다.");
  }

  const brands = items.map((item) => item.brand).filter(Boolean);
  if (brands.length) {
    const uniqueBrands = [...new Set(brands)];
    insights.push(`${uniqueBrands.length}개의 브랜드가 섞여 있습니다.`);
  }

  return insights;
}

function renderSnapshot(snapshot) {
  const items = snapshot?.items || [];
  const knownPrices = items.filter((item) => parseWon(item.price) !== null || item.price).length;

  elements.itemCount.textContent = String(items.length);
  elements.knownPriceCount.textContent = String(knownPrices);
  elements.parserLabel.textContent = snapshot?.parserVersion || "";

  elements.insights.replaceChildren(...buildInsights(snapshot).map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "아직 표시할 상품이 없습니다.";
    elements.itemsList.replaceChildren(empty);
    return;
  }

  const itemNodes = items.map((item) => {
    const node = elements.itemTemplate.content.cloneNode(true);
    const article = node.querySelector(".item");
    const image = node.querySelector(".item-image");
    const brand = node.querySelector(".item-brand");
    const name = node.querySelector(".item-name");
    const option = node.querySelector(".item-option");
    const price = node.querySelector(".item-price");
    const quantity = node.querySelector(".item-quantity");

    if (item.imageUrl) {
      image.src = item.imageUrl;
    } else {
      image.hidden = true;
      article.classList.add("no-image");
    }

    image.alt = item.name || "상품 이미지";
    brand.textContent = item.brand || "브랜드 정보 없음";
    name.textContent = item.name || "상품명 인식 필요";
    option.textContent = item.option || "";
    price.textContent = item.price || "가격 정보 없음";
    quantity.textContent = `수량 ${item.quantity || 1}`;

    return node;
  });

  elements.itemsList.replaceChildren(...itemNodes);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function requestPageSnapshot(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CART_SNAPSHOT_FROM_PAGE" });
    if (response?.snapshot) {
      return response.snapshot;
    }
  } catch {
    // The content script only exists on matched shopping pages.
  }
  return null;
}

async function readStoredSnapshot(tabId) {
  const response = await chrome.runtime.sendMessage({ type: "GET_LAST_SNAPSHOT", tabId });
  return response?.snapshot || null;
}

async function refresh() {
  const tab = await getActiveTab();
  state.activeTabId = tab?.id ?? null;

  if (!tab?.id) {
    setStatus("활성 탭을 찾지 못했습니다.", "warn");
    renderSnapshot(null);
    return;
  }

  const pageSnapshot = await requestPageSnapshot(tab.id);
  const storedSnapshot = pageSnapshot || await readStoredSnapshot(tab.id);
  state.snapshot = storedSnapshot;

  if (!storedSnapshot) {
    setStatus("무신사 장바구니 페이지에서 열어주세요.", "warn");
    renderSnapshot(null);
    return;
  }

  if (storedSnapshot.site === "unsupported") {
    setStatus("현재 페이지는 아직 지원하지 않습니다.", "warn");
  } else if (storedSnapshot.items.length) {
    setStatus(`${storedSnapshot.label} 장바구니를 읽었습니다.`, "ok");
  } else {
    setStatus("장바구니 페이지는 감지했지만 상품을 찾지 못했습니다.", "warn");
  }

  renderSnapshot(storedSnapshot);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CART_SNAPSHOT_UPDATED") {
    return;
  }

  if (message.payload?.tabId !== state.activeTabId) {
    return;
  }

  state.snapshot = message.payload;
  renderSnapshot(message.payload);
});

elements.refreshButton.addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
  }
});

refresh();
