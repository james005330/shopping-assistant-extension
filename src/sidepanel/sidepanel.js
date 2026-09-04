const state = {
  activeTabId: null,
  snapshot: null
};

const elements = {
  status: document.querySelector("#status"),
  itemCount: document.querySelector("#itemCount"),
  bagCount: document.querySelector("#bagCount"),
  bagTotal: document.querySelector("#bagTotal"),
  physicsStage: document.querySelector("#physicsStage"),
  physicsItems: document.querySelector("#physicsItems"),
  bagEmpty: document.querySelector("#bagEmpty"),
  insights: document.querySelector("#insights"),
  parserLabel: document.querySelector("#parserLabel"),
  itemsList: document.querySelector("#itemsList"),
  refreshButton: document.querySelector("#refreshButton"),
  itemTemplate: document.querySelector("#itemTemplate")
};

const physics = {
  engine: null,
  frameRequest: null,
  lastFrameAt: 0,
  walls: [],
  items: new Map(),
  resizeObserver: null,
  drag: null
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

function itemKey(item) {
  return item.id || item.url || item.name || JSON.stringify(item);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function itemSizeForCount(count) {
  if (count <= 1) return 118;
  if (count <= 3) return 100;
  if (count <= 6) return 86;
  return 74;
}

function getMatter() {
  return window.Matter || null;
}

function ensurePhysics() {
  const Matter = getMatter();
  if (!Matter || !elements.physicsStage || !elements.physicsItems) {
    return false;
  }

  if (!physics.engine) {
    physics.engine = Matter.Engine.create({ enableSleeping: true });
    physics.engine.gravity.y = 0.92;
    physics.engine.gravity.x = 0;
    rebuildWalls();
    startPhysicsLoop();

    physics.resizeObserver = new ResizeObserver(() => {
      rebuildWalls();
      keepAllBodiesInStage();
    });
    physics.resizeObserver.observe(elements.physicsStage);
  }

  return true;
}

function stageSize() {
  const rect = elements.physicsStage.getBoundingClientRect();
  return {
    width: Math.max(320, rect.width),
    height: Math.max(320, rect.height)
  };
}

function rebuildWalls() {
  const Matter = getMatter();
  if (!Matter || !physics.engine) {
    return;
  }

  const { Bodies, World } = Matter;
  const { width, height } = stageSize();
  const oldWalls = physics.walls;
  const wallOptions = {
    isStatic: true,
    label: "bag-wall",
    restitution: 0.28,
    friction: 0.82
  };

  physics.walls = [
    Bodies.rectangle(width / 2, height - 37, width - 86, 26, wallOptions),
    Bodies.rectangle(41, height - 154, 24, height * 0.62, { ...wallOptions, angle: -0.12 }),
    Bodies.rectangle(width - 41, height - 154, 24, height * 0.62, { ...wallOptions, angle: 0.12 }),
    Bodies.rectangle(width / 2, -190, width + 140, 24, wallOptions)
  ];

  oldWalls.forEach((wall) => World.remove(physics.engine.world, wall));
  World.add(physics.engine.world, physics.walls);
}

function startPhysicsLoop() {
  if (physics.frameRequest) {
    return;
  }

  const step = (time) => {
    const Matter = getMatter();
    if (!Matter || !physics.engine) {
      physics.frameRequest = null;
      return;
    }

    const delta = physics.lastFrameAt ? clamp(time - physics.lastFrameAt, 12, 34) : 16.67;
    physics.lastFrameAt = time;
    Matter.Engine.update(physics.engine, delta);
    releaseStuckDrag();
    keepAllBodiesInStage();
    paintPhysicsItems();
    physics.frameRequest = requestAnimationFrame(step);
  };

  physics.frameRequest = requestAnimationFrame(step);
}

function makePhysicsElement(item, size) {
  const tile = document.createElement("div");
  tile.className = "physics-product";
  tile.title = item.name || "장바구니 아이템";
  tile.style.setProperty("--item-size", `${size}px`);

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
}

function spawnX(index, count, width, size) {
  const spread = Math.max(size, width - size * 1.6);
  const base = size * 0.8 + ((index * 83) % Math.max(1, spread));
  const wave = Math.sin((index + count) * 1.7) * 28;
  return clamp(base + wave, size / 2 + 28, width - size / 2 - 28);
}

function addPhysicsItem(item, index, count) {
  const Matter = getMatter();
  if (!Matter || !physics.engine) {
    return;
  }

  const { Bodies, Body, World } = Matter;
  const { width } = stageSize();
  const size = itemSizeForCount(count);
  const body = Bodies.rectangle(
    spawnX(index, count, width, size),
    -size - index * 58,
    size,
    size,
    {
      label: "cart-item",
      restitution: 0.31,
      friction: 0.64,
      frictionStatic: 0.86,
      frictionAir: 0.026,
      density: 0.0012,
      chamfer: { radius: 8 }
    }
  );

  Body.setVelocity(body, {
    x: ((index % 2 === 0 ? 1 : -1) * (0.35 + (index % 3) * 0.16)),
    y: 0.55
  });
  Body.setAngularVelocity(body, (index % 2 === 0 ? 1 : -1) * (0.045 + (index % 4) * 0.012));

  const element = makePhysicsElement(item, size);
  elements.physicsItems.append(element);
  World.add(physics.engine.world, body);

  physics.items.set(itemKey(item), { body, element, item, size, lastDragPoint: null, dragHeartbeatAt: 0 });
  attachDragHandlers(itemKey(item), element);
}

function attachDragHandlers(key, element) {
  element.addEventListener("pointerdown", (event) => {
    const entry = physics.items.get(key);
    const Matter = getMatter();
    if (!entry || !Matter) {
      return;
    }

    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);
    physics.drag = { key, pointerId: event.pointerId, previous: point, startedAt: performance.now() };
    entry.dragHeartbeatAt = Date.now();
    Matter.Body.setStatic(entry.body, true);
    Matter.Body.setPosition(entry.body, point);
    Matter.Body.setVelocity(entry.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(entry.body, 0);
    element.classList.add("is-dragging");
  });

  element.addEventListener("pointermove", (event) => {
    const drag = physics.drag;
    const entry = drag ? physics.items.get(drag.key) : null;
    const Matter = getMatter();
    if (!drag || !entry || !Matter || event.pointerId !== drag.pointerId) {
      return;
    }

    const point = pointerPoint(event);
    entry.lastDragPoint = {
      x: point.x - drag.previous.x,
      y: point.y - drag.previous.y
    };
    drag.previous = point;
    entry.dragHeartbeatAt = Date.now();
    Matter.Body.setPosition(entry.body, clampPointToStage(point, entry.size));
  });

  const endDrag = (event) => {
    const drag = physics.drag;
    const entry = drag ? physics.items.get(drag.key) : null;
    const Matter = getMatter();
    if (!drag || !entry || !Matter || event.pointerId !== drag.pointerId) {
      return;
    }

    const velocity = entry.lastDragPoint || { x: 0, y: 0 };
    Matter.Body.setStatic(entry.body, false);
    Matter.Body.setVelocity(entry.body, {
      x: clamp(velocity.x * 0.42, -12, 12),
      y: clamp(velocity.y * 0.42, -12, 12)
    });
    Matter.Body.setAngularVelocity(entry.body, clamp(velocity.x * 0.006, -0.18, 0.18));
    entry.lastDragPoint = null;
    element.classList.remove("is-dragging");
    physics.drag = null;
  };

  element.addEventListener("pointerup", endDrag);
  element.addEventListener("pointercancel", endDrag);
}

function pointerPoint(event) {
  const rect = elements.physicsStage.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function clampPointToStage(point, size) {
  const { width, height } = stageSize();
  const inset = size / 2;
  return {
    x: clamp(point.x, inset + 18, width - inset - 18),
    y: clamp(point.y, inset + 18, height - inset - 18)
  };
}

function releaseStuckDrag() {
  const Matter = getMatter();
  if (!Matter) {
    return;
  }

  physics.items.forEach((entry) => {
    if (!entry.body.isStatic || physics.drag?.key === itemKey(entry.item) || Date.now() - entry.dragHeartbeatAt < 2000) {
      return;
    }

    Matter.Body.setStatic(entry.body, false);
    Matter.Body.setVelocity(entry.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(entry.body, 0);
  });
}

function keepAllBodiesInStage() {
  const Matter = getMatter();
  if (!Matter) {
    return;
  }

  physics.items.forEach((entry) => {
    if (entry.body.isStatic) {
      return;
    }

    const position = entry.body.position;
    const angle = entry.body.angle;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(angle)) {
      const { width } = stageSize();
      Matter.Body.setPosition(entry.body, { x: width / 2, y: -entry.size });
      Matter.Body.setAngle(entry.body, 0);
      Matter.Body.setVelocity(entry.body, { x: 0, y: 0.45 });
      Matter.Body.setAngularVelocity(entry.body, 0);
      return;
    }

    const { width, height } = stageSize();
    const inset = entry.size / 2;
    const escapedSideways = position.x < -entry.size || position.x > width + entry.size;
    const escapedDown = position.y > height + entry.size;
    const escapedUp = position.y < -height;

    if (escapedSideways || escapedDown || escapedUp) {
      Matter.Body.setPosition(entry.body, {
        x: clamp(position.x, inset + 28, width - inset - 28),
        y: escapedDown || escapedUp ? -entry.size : position.y
      });
      Matter.Body.setVelocity(entry.body, { x: 0, y: 0.45 });
    }
  });
}

function paintPhysicsItems() {
  physics.items.forEach((entry) => {
    const { body, element, size } = entry;
    element.style.transform = `translate(${body.position.x - size / 2}px, ${body.position.y - size / 2}px) rotate(${body.angle}rad)`;
  });
}

function clearPhysicsItems() {
  const Matter = getMatter();
  if (Matter && physics.engine) {
    physics.items.forEach((entry) => Matter.World.remove(physics.engine.world, entry.body));
  }
  physics.items.clear();
  elements.physicsItems.replaceChildren();
}

function renderStaticBagFallback(items) {
  elements.physicsItems.replaceChildren(...items.map((item, index) => {
    const size = itemSizeForCount(items.length);
    const tile = makePhysicsElement(item, size);
    tile.style.transform = `translate(${34 + (index % 3) * 76}px, ${142 + Math.floor(index / 3) * 58}px) rotate(${[-8, 5, -3][index % 3]}deg)`;
    return tile;
  }));
}

function syncPhysicsBag(items) {
  elements.bagEmpty.hidden = items.length > 0;

  if (!items.length) {
    clearPhysicsItems();
    return;
  }

  if (!ensurePhysics()) {
    renderStaticBagFallback(items);
    return;
  }

  const nextKeys = new Set(items.map(itemKey));
  physics.items.forEach((entry, key) => {
    if (!nextKeys.has(key)) {
      const Matter = getMatter();
      if (Matter && physics.engine) {
        Matter.World.remove(physics.engine.world, entry.body);
      }
      entry.element.remove();
      physics.items.delete(key);
    }
  });

  items.forEach((item, index) => {
    const key = itemKey(item);
    const entry = physics.items.get(key);
    if (entry) {
      entry.item = item;
      return;
    }
    addPhysicsItem(item, index, items.length);
  });
}

function renderSnapshot(snapshot) {
  const items = snapshot?.items || [];
  const total = cartTotal(items);

  elements.itemCount.textContent = String(items.length);
  elements.bagCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  elements.bagTotal.textContent = total > 0 ? formatWon(total) : "가격 대기중";
  elements.parserLabel.textContent = snapshot?.parserVersion || "";

  syncPhysicsBag(items);

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
