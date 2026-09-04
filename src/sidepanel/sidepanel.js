const state = {
  activeTabId: null,
  snapshot: null
};

const elements = {
  status: document.querySelector("#status"),
  itemCount: document.querySelector("#itemCount"),
  bagCount: document.querySelector("#bagCount"),
  bagTotal: document.querySelector("#bagTotal"),
  bagItems: document.querySelector("#bagItems"),
  bagEmpty: document.querySelector("#bagEmpty"),
  insights: document.querySelector("#insights"),
  parserLabel: document.querySelector("#parserLabel"),
  itemsList: document.querySelector("#itemsList"),
  refreshButton: document.querySelector("#refreshButton"),
  itemTemplate: document.querySelector("#itemTemplate")
};

const BAG_LAYOUTS = [
  [{ x: 50, y: 52, size: 150, rot: -3 }],
  [{ x: 38, y: 56, size: 128, rot: -8 }, { x: 63, y: 48, size: 128, rot: 7 }],
  [{ x: 31, y: 61, size: 112, rot: -10 }, { x: 54, y: 47, size: 124, rot: 2 }, { x: 72, y: 62, size: 108, rot: 9 }],
  [{ x: 28, y: 60, size: 104, rot: -10 }, { x: 47, y: 47, size: 116, rot: 4 }, { x: 66, y: 58, size: 104, rot: 12 }, { x: 52, y: 72, size: 98, rot: -4 }]
];

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

function cartTotal(items) {
  return items.reduce((sum, item) => {
    const value = parseWon(item.price);
    return Number.isFinite(value) ? sum + value * (item.quantity || 1) : sum;
  }, 0);
}

function buildInsights(snapshot) {
  const items = snapshot?.items || [];
  if (!items.length) {
    return ["장바구니 아이템을 찾으면 가방 안에 사진이 담깁니다."];
  }

  const total = cartTotal(items);
  const insights = [`지금 가방 안에는 ${items.length}개의 아이템이 있습니다.`];

  if (total > 0) {
    insights.push(`인식된 가격 기준 합계는 ${formatWon(total)}입니다.`);
  }

  const categories = items.map((item) => item.category).filter(Boolean);
  if (categories.length) {
    insights.push(`${new Set(categories).size}개의 카테고리가 담겨 있습니다.`);
  }

  return insights;
}

function getBagLayout(index, count) {
  if (count <= BAG_LAYOUTS.length) {
    return BAG_LAYOUTS[count - 1][index];
  }

  return {
    x: 24 + (index % 4) * 17,
    y: 42 + Math.floor(index / 4) * 18,
    size: 86,
    rot: [-9, 4, -3, 8][index % 4]
  };
}

function renderBag(items) {
  elements.bagEmpty.hidden = items.length > 0;

  const nodes = items.map((item, index) => {
    const layout = getBagLayout(index, items.length);
    const tile = document.createElement("div");
    tile.className = "bag-product";
    tile.title = item.name || "장바구니 아이템";
    tile.style.setProperty("--x", `${layout.x}%`);
    tile.style.setProperty("--y", `${layout.y}%`);
    tile.style.setProperty("--size", `${layout.size}px`);
    tile.style.setProperty("--rot", `${layout.rot}deg`);

    if (item.imageUrl) {
      const image = document.createElement("img");
      image.src = item.imageUrl;
      image.alt = item.name || "장바구니 아이템";
      tile.append(image);
    } else {
      tile.classList.add("no-image");
      tile.textContent = item.name || "Item";
    }

    return tile;
  });

  elements.bagItems.replaceChildren(...nodes);
}

function renderSnapshot(snapshot) {
  const items = snapshot?.items || [];
  const total = cartTotal(items);

  elements.itemCount.textContent = String(items.length);
  elements.bagCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  elements.bagTotal.textContent = total > 0 ? formatWon(total) : "가격 대기중";
  elements.parserLabel.textContent = snapshot?.parserVersion || "";

  renderBag(items);

  elements.insights.replaceChildren(...buildInsights(snapshot).map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "아직 담긴 아이템이 없습니다.";
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
    setStatus(`${storedSnapshot.label}에서 ${storedSnapshot.items.length}개의 아이템을 담았습니다.`, "ok");
  } else {
    setStatus("장바구니 페이지는 감지했지만 아이템을 찾지 못했습니다.", "warn");
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
