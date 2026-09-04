# Cart Lens MVP Architecture

## Goal

Cart Lens reads product data from a shopping cart page and renders the normalized cart in Chrome's right Side Panel. The first parser targets MUSINSA cart pages, while the code is arranged so Coupang, Olive Young, and other shopping sites can be added later without rewriting the side panel.

## Flow

1. Chrome injects `src/content/parsers.js` and `src/content/content.js` on MUSINSA pages.
2. `content.js` asks `CartParsers.parseCurrentPage()` for a normalized cart snapshot.
3. The content script sends the snapshot to the background service worker with a `CART_SNAPSHOT` message.
4. `service-worker.js` stores the latest snapshot per tab in `chrome.storage.session`.
5. `sidepanel.js` requests the active tab's newest snapshot and renders it.

## Snapshot Shape

```json
{
  "site": "musinsa",
  "label": "MUSINSA",
  "url": "https://...",
  "parsedAt": "2026-09-04T00:00:00.000Z",
  "parserVersion": "musinsa.heuristic.v1",
  "items": [
    {
      "id": "stable item id",
      "name": "상품명",
      "brand": "브랜드",
      "option": "옵션",
      "price": "39,000원",
      "quantity": 1,
      "imageUrl": "https://...",
      "url": "https://..."
    }
  ]
}
```

## Adding Another Shopping Site

Add a parser function in `src/content/parsers.js`, then update `CartParsers.resolve()` to return that parser for the new hostname and cart URL pattern. Keep the returned snapshot shape the same so the side panel does not need site-specific UI code.

## Where AI Fits Later

The cleanest production direction is:

1. Keep content scripts limited to page reading.
2. Send normalized cart snapshots to a small backend.
3. Let the backend call an AI API.
4. Return structured analysis, such as duplicate categories, budget warnings, style grouping, or "buy now vs wait" recommendations.

For a private prototype, the AI call can also be triggered directly from `sidepanel.js`, but that exposes keys if the extension is shared.
