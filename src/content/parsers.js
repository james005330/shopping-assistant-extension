(function registerCartParsers() {
  const WON_PRICE_PATTERN = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/;
  const GLOBAL_PRICE_PATTERN = /[$€£]\s?[0-9]+(?:[.,][0-9]{2})?/;
  const OLIVEYOUNG_IMAGE_BASE = "https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/220/";

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstText(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const text = cleanText(node?.value || node?.innerText || node?.textContent || node?.getAttribute?.("aria-label"));
      if (text) {
        return text;
      }
    }
    return "";
  }

  function dataText(root, name) {
    return cleanText(root.getAttribute(`data-${name}`));
  }

  function inputValue(root, selector) {
    const input = root.querySelector(selector);
    return cleanText(input?.value || input?.getAttribute?.("value"));
  }

  function formatWonFromData(value) {
    const number = Number(cleanText(value).replace(/,/g, ""));
    return Number.isFinite(number) && number > 0
      ? `${number.toLocaleString("ko-KR")}원`
      : "";
  }

  function firstImage(root) {
    const images = [...root.querySelectorAll("img[src], img[data-src], img[data-original]")];
    for (const image of images) {
      const src = image.getAttribute("data-original") || image.getAttribute("data-src") || image.getAttribute("src");
      if (src && !src.includes("pc_loading.gif")) {
        return new URL(src, location.href).href;
      }
    }
    return "";
  }

  function firstLink(root) {
    const anchor = root.matches?.("a[href]") ? root : root.querySelector("a[href*='/app/goods/'], a[href*='/products/'], a[href]");
    return anchor?.href || "";
  }

  function textPrice(root) {
    const text = cleanText(root.innerText || root.textContent);
    const won = text.match(WON_PRICE_PATTERN);
    if (won) {
      return `${won[1]}원`;
    }

    const global = text.match(GLOBAL_PRICE_PATTERN);
    return global?.[0] || "";
  }

  function parseNumberFromText(text, fallback = 1) {
    const match = cleanText(text).match(/[0-9]+/);
    return match ? Number(match[0]) : fallback;
  }

  function stableId(parts) {
    return parts.filter(Boolean).join("|").toLowerCase().slice(0, 240);
  }

  function dedupeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = stableId([item.name, item.brand, item.price, item.url]);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function uniqueNodes(nodes) {
    return [...new Set(nodes)];
  }

  function collectRows(selectors) {
    const candidates = [];
    for (const selector of selectors) {
      try {
        candidates.push(...document.querySelectorAll(selector));
      } catch {
        // Some browsers may not support newer selector syntax in content scripts yet.
      }
    }
    return uniqueNodes(candidates);
  }

  function validCandidateRows(nodes) {
    return nodes.filter((node) => {
      const text = cleanText(node.innerText || node.textContent);
      const dataName = dataText(node, "item-name");
      const hasProductLink = Boolean(node.matches?.("a[href*='/app/goods/'], a[href*='/products/']") || node.querySelector("a[href*='/app/goods/'], a[href*='/products/']"));
      const hasPrice = dataText(node, "price") || WON_PRICE_PATTERN.test(text) || GLOBAL_PRICE_PATTERN.test(text);
      return dataName || (text.length > 12 && (hasProductLink || hasPrice));
    });
  }

  function groupRowsByItemId(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = dataText(row, "item-id") || stableId([
        dataText(row, "item-name"),
        firstLink(row),
        firstImage(row)
      ]);
      if (!key) {
        continue;
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    }
    return [...groups.values()];
  }

  function parseItemFromRows(rows) {
    const primary = rows.find((row) => dataText(row, "item-name")) || rows[0];
    const imageRow = rows.find((row) => firstImage(row)) || primary;
    const linkRow = rows.find((row) => firstLink(row)) || primary;
    const textRow = rows.find((row) => cleanText(row.innerText || row.textContent)) || primary;

    const name = dataText(primary, "item-name") || firstText(textRow, [
      "[data-testid*='goods'][data-testid*='name']",
      "[class*='goods'][class*='name']",
      "[class*='Goods'][class*='Name']",
      "[class*='product'][class*='name']",
      "[class*='Product'][class*='Name']",
      "a[href*='/app/goods/']",
      "a[href*='/products/']"
    ]);

    const brand = dataText(primary, "item-brand") || firstText(textRow, [
      "[data-testid*='brand']",
      "[class*='brand']",
      "[class*='Brand']"
    ]);

    const option = dataText(primary, "item-variant").replace(/\^/g, " / ") || firstText(textRow, [
      "[data-testid*='option']",
      "[class*='option']",
      "[class*='Option']",
      "[class*='size']",
      "[class*='Size']"
    ]);

    const price = formatWonFromData(dataText(primary, "price")) || firstText(textRow, [
      "[data-testid*='price']",
      "[class*='price']",
      "[class*='Price']",
      "[class*='amount']",
      "[class*='Amount']"
    ]) || textPrice(textRow);

    const quantityText = dataText(primary, "quantity") || firstText(textRow, [
      "input[type='number']",
      "[data-testid*='quantity']",
      "[class*='quantity']",
      "[class*='Quantity']"
    ]);

    return {
      id: dataText(primary, "item-id") || stableId([name, brand, option, price, firstLink(linkRow)]),
      name,
      brand,
      option,
      price,
      category: dataText(primary, "item-category"),
      quantity: parseNumberFromText(quantityText, 1),
      imageUrl: firstImage(imageRow),
      url: firstLink(linkRow)
    };
  }

  function findCartRows() {
    return validCandidateRows(collectRows([
      "[data-section-name='cart_list'][data-item-list-id='cart_list'][data-item-id]",
      "[data-item-list-id='cart_list'][data-item-id]",
      "[data-section-name='cart_list'][data-item-id]"
    ]));
  }

  function findFallbackRows() {
    const fallbackSelectors = [
      "[data-cart-item-id]",
      "[data-cart-no]",
      "[data-goods-no]",
      "[data-goods-id]",
      "[class*='cart'] li",
      "[class*='Cart'] li",
      "[class*='shopping'] li",
      "[class*='Shopping'] li",
      "li:has(a[href*='/app/goods/'])",
      "li:has(a[href*='/products/'])"
    ];

    return validCandidateRows(collectRows(fallbackSelectors)).filter((row) => {
      const itemListId = dataText(row, "item-list-id");
      const sectionName = dataText(row, "section-name");
      return !itemListId.startsWith("cart_rec") && !sectionName.startsWith("cart_rec");
    });
  }

  function findCandidateRows() {
    const cartDataRows = findCartRows();
    return cartDataRows.length ? cartDataRows : findFallbackRows();
  }

  function parseMusinsaCart() {
    const rows = findCandidateRows();
    const groupedRows = groupRowsByItemId(rows);

    const items = groupedRows.map(parseItemFromRows)
      .filter((item) => item.name || item.price || item.url);

    return {
      site: "musinsa",
      label: "MUSINSA",
      url: location.href,
      parsedAt: new Date().toISOString(),
      items: dedupeItems(items),
      parserVersion: "musinsa.cart-list.v3"
    };
  }

  function isMusinsaCart(url) {
    const hostname = url.hostname.replace(/^www\./, "");
    const path = url.pathname.toLowerCase();
    return hostname.endsWith("musinsa.com") && (
      path.includes("/cart") ||
      path.includes("/order/cart") ||
      path.includes("/app/cart")
    );
  }

  function scriptStringValue(root, key) {
    const text = [...root.querySelectorAll("script")]
      .map((script) => script.textContent || "")
      .join("\n");
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`cartItem\\.${escaped}\\s*=\\s*[\"']([^\"']*)[\"']`));
    return cleanText(match?.[1]);
  }

  function scriptNumberValue(root, key) {
    const text = [...root.querySelectorAll("script")]
      .map((script) => script.textContent || "")
      .join("\n");
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`cartItem\\.${escaped}\\s*=\\s*(?:parseInt\\()?["]?([0-9,]+)["]?`));
    return cleanText(match?.[1]);
  }

  function oliveYoungGoodsNoFromHref(root) {
    const href = root.querySelector("a[href*='clickGoodsDetail']")?.getAttribute("href") || "";
    const match = href.match(/clickGoodsDetail\(['\"]([^'\"]+)/);
    return cleanText(match?.[1]);
  }

  function oliveYoungGoodsUrl(goodsNo) {
    return goodsNo
      ? `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${encodeURIComponent(goodsNo)}`
      : "";
  }

  function oliveYoungImageFromScript(root) {
    const path = scriptStringValue(root, "thnlPathNm");
    return path ? `${OLIVEYOUNG_IMAGE_BASE}${path}` : "";
  }

  function oliveYoungPrice(root) {
    return formatWonFromData(inputValue(root, "input[name='saleCpnDcPrc']")) ||
      formatWonFromData(scriptNumberValue(root, "saleCpnDcPrc")) ||
      formatWonFromData(inputValue(root, "input[name='s_sale_prc']")) ||
      formatWonFromData(scriptNumberValue(root, "salePrc")) ||
      textPrice(root);
  }

  function oliveYoungQuantity(root) {
    const selected = firstText(root, ["select option:checked"]);
    const selectValue = inputValue(root, "select");
    const checkboxQty = cleanText(root.querySelector("input[ordqty]")?.getAttribute("ordqty"));
    const scriptQty = scriptNumberValue(root, "ordQty");
    return parseNumberFromText(selected || selectValue || checkboxQty || scriptQty, 1);
  }

  function parseOliveYoungItem(row) {
    const goodsNo = inputValue(row, "input[name='s_goods_no']") ||
      oliveYoungGoodsNoFromHref(row) ||
      scriptStringValue(row, "goodsNo");
    const itemNo = inputValue(row, "input[name='s_item_no']") || scriptStringValue(row, "itemNo");
    const cartNo = inputValue(row, "input[name='s_cart_no']") || scriptStringValue(row, "cartNo");
    const brand = firstText(row, [".prd_name #brandNm", "#brandNm"]) || scriptStringValue(row, "onlBrndNm");
    const name = firstText(row, [".prd_name #goodsNm", "#goodsNm"]) || scriptStringValue(row, "goodsNm");
    const option = firstText(row, [".prd_opt span"]) || scriptStringValue(row, "itemNm");
    const price = oliveYoungPrice(row);
    const imageUrl = firstImage(row) || oliveYoungImageFromScript(row);
    const url = oliveYoungGoodsUrl(goodsNo);
    const category = scriptStringValue(row, "categoryNm");
    const quantity = oliveYoungQuantity(row);

    return {
      id: stableId(["oliveyoung", cartNo, goodsNo, itemNo]) || stableId(["oliveyoung", name, option, price]),
      name,
      brand,
      option,
      price,
      category,
      quantity,
      imageUrl,
      url
    };
  }

  function findOliveYoungRows() {
    return collectRows([
      "#Container .tbl_cont_area",
      ".cart_tbl .tbl_cont_area",
      ".tbl_cont_area"
    ]).filter((row) => {
      const hasProductInfo = Boolean(row.querySelector(".prd_info") || row.querySelector("input[name='s_goods_no']"));
      const hasName = Boolean(row.querySelector("#goodsNm") || scriptStringValue(row, "goodsNm"));
      return hasProductInfo && hasName;
    });
  }

  function parseOliveYoungCart() {
    const items = findOliveYoungRows()
      .map(parseOliveYoungItem)
      .filter((item) => item.name || item.price || item.url);

    return {
      site: "oliveyoung",
      label: "OLIVEYOUNG",
      url: location.href,
      parsedAt: new Date().toISOString(),
      items: dedupeItems(items),
      parserVersion: "oliveyoung.cart-table.v1"
    };
  }

  function isOliveYoungCart(url) {
    const hostname = url.hostname.replace(/^www\./, "");
    const path = url.pathname.toLowerCase();
    return hostname.endsWith("oliveyoung.co.kr") && path.includes("/store/cart/");
  }

  window.CartParsers = {
    resolve(url = location.href) {
      const parsed = new URL(url);
      if (isMusinsaCart(parsed)) {
        return parseMusinsaCart;
      }
      if (isOliveYoungCart(parsed)) {
        return parseOliveYoungCart;
      }
      return null;
    },
    parseCurrentPage() {
      const parser = this.resolve(location.href);
      if (!parser) {
        return {
          site: "unsupported",
          label: "Unsupported page",
          url: location.href,
          parsedAt: new Date().toISOString(),
          items: [],
          parserVersion: "none"
        };
      }
      return parser();
    }
  };
})();
