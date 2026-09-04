(function registerCartParsers() {
  const WON_PRICE_PATTERN = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/;
  const GLOBAL_PRICE_PATTERN = /[$€£]\s?[0-9]+(?:[.,][0-9]{2})?/;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstText(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const text = cleanText(node?.innerText || node?.textContent || node?.getAttribute?.("aria-label"));
      if (text) {
        return text;
      }
    }
    return "";
  }

  function firstImage(root) {
    const image = root.querySelector("img[src], img[data-src], img[data-original]");
    const src = image?.getAttribute("src") || image?.getAttribute("data-src") || image?.getAttribute("data-original");
    return src ? new URL(src, location.href).href : "";
  }

  function firstLink(root) {
    const anchor = root.querySelector("a[href*='/app/goods/'], a[href*='/products/'], a[href]");
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

  function findCandidateRows() {
    const preferredSelectors = [
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

    const candidates = [];
    for (const selector of preferredSelectors) {
      try {
        candidates.push(...document.querySelectorAll(selector));
      } catch {
        // Some browsers may not support :has in content scripts yet.
      }
    }

    return candidates.filter((node) => {
      const text = cleanText(node.innerText || node.textContent);
      const hasProductLink = Boolean(node.querySelector("a[href*='/app/goods/'], a[href*='/products/']"));
      const hasPrice = WON_PRICE_PATTERN.test(text) || GLOBAL_PRICE_PATTERN.test(text);
      return text.length > 12 && (hasProductLink || hasPrice);
    });
  }

  function parseMusinsaCart() {
    const rows = findCandidateRows();

    const items = rows.map((row) => {
      const name = firstText(row, [
        "[data-testid*='goods'][data-testid*='name']",
        "[class*='goods'][class*='name']",
        "[class*='Goods'][class*='Name']",
        "[class*='product'][class*='name']",
        "[class*='Product'][class*='Name']",
        "a[href*='/app/goods/']",
        "a[href*='/products/']"
      ]);

      const brand = firstText(row, [
        "[data-testid*='brand']",
        "[class*='brand']",
        "[class*='Brand']"
      ]);

      const option = firstText(row, [
        "[data-testid*='option']",
        "[class*='option']",
        "[class*='Option']",
        "[class*='size']",
        "[class*='Size']"
      ]);

      const price = firstText(row, [
        "[data-testid*='price']",
        "[class*='price']",
        "[class*='Price']",
        "[class*='amount']",
        "[class*='Amount']"
      ]) || textPrice(row);

      const quantityText = firstText(row, [
        "input[type='number']",
        "[data-testid*='quantity']",
        "[class*='quantity']",
        "[class*='Quantity']"
      ]);

      return {
        id: stableId([name, brand, option, price, firstLink(row)]),
        name,
        brand,
        option,
        price,
        quantity: parseNumberFromText(quantityText, 1),
        imageUrl: firstImage(row),
        url: firstLink(row)
      };
    }).filter((item) => item.name || item.price || item.url);

    return {
      site: "musinsa",
      label: "MUSINSA",
      url: location.href,
      parsedAt: new Date().toISOString(),
      items: dedupeItems(items),
      parserVersion: "musinsa.heuristic.v1"
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

  window.CartParsers = {
    resolve(url = location.href) {
      const parsed = new URL(url);
      if (isMusinsaCart(parsed)) {
        return parseMusinsaCart;
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
