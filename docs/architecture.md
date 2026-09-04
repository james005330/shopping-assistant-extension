# CartPeek Architecture

## Goal

CartPeek reads product data from a shopping cart page and renders the normalized cart as a visual bag in Chrome's right Side Panel. The first parser targets MUSINSA cart pages, while the code is arranged so Coupang, Olive Young, and other shopping sites can be added later without rewriting the side panel.

## Flow

1. Chrome injects `src/content/parsers.js` and `src/content/content.js` on MUSINSA pages.
2. `content.js` asks `CartParsers.parseCurrentPage()` for a normalized cart snapshot.
3. The content script sends the snapshot to the background service worker with a `CART_SNAPSHOT` message.
4. `service-worker.js` stores the latest snapshot per tab in `chrome.storage.session`.
5. `sidepanel.js` requests the active tab's newest snapshot and renders item photos inside the bag UI.

## Snapshot Shape

```json
{
  "site": "musinsa",
  "label": "MUSINSA",
  "url": "https://...",
  "parsedAt": "2026-09-04T00:00:00.000Z",
  "parserVersion": "musinsa.cart-list.v3",
  "items": [
    {
      "id": "6928720",
      "name": "상품명",
      "brand": "브랜드",
      "option": "Black / Free",
      "price": "49,900원",
      "category": "Clothing|후드 집업",
      "quantity": 1,
      "imageUrl": "https://...",
      "url": "https://..."
    }
  ]
}
```

## MUSINSA Cart Parsing

The current MUSINSA parser treats `data-item-list-id="cart_list"` and `data-section-name="cart_list"` as the real cart area. Recommendation rails such as `cart_rec_one` and `cart_rec_two` are ignored. Duplicate cart anchors for thumbnail/name are grouped by `data-item-id`.

## Adding Another Shopping Site

Add a parser function in `src/content/parsers.js`, then update `CartParsers.resolve()` to return that parser for the new hostname and cart URL pattern. Keep the returned snapshot shape the same so the side panel can keep rendering the same bag UI.

## Where SnapBag-style Features Fit Later

The bag UI is now the main surface. Next features can build on top of the same normalized cart snapshot: visual outfit grouping, saved bag snapshots, shareable bag images, budget tags, category clustering, or AI commentary.
