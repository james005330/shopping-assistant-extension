# InMyCart

InMyCart는 쇼핑몰 장바구니에 담긴 아이템을 Chrome 오른쪽 Side Panel의 가방 UI 안에 시각적으로 담아 보여주는 실험용 확장프로그램입니다.

현재 MVP는 MUSINSA 장바구니 페이지를 우선 지원합니다. 장바구니 데이터를 읽는 파서는 분리되어 있어 Coupang, Olive Young 같은 쇼핑몰도 나중에 추가할 수 있습니다.

## 지금 되는 것

- Chrome Manifest V3 확장프로그램 구조
- Chrome Side Panel UI
- MUSINSA 장바구니 페이지 감지
- 실제 장바구니 영역인 `cart_list`만 읽고 추천 영역인 `cart_rec_one`, `cart_rec_two`는 제외
- 장바구니 상품명, 브랜드, 옵션, 가격, 수량, 이미지, 링크 추출
- 같은 상품이 썸네일/상품명 링크로 중복 잡히는 경우 `data-item-id` 기준으로 병합
- 장바구니 아이템 사진을 큰 가방 UI 안에 배치
- content script, background service worker, side panel 간 메시지 통신

## 폴더 구조

```text
manifest.json
src/
  background/
    service-worker.js
  content/
    parsers.js
    content.js
  sidepanel/
    sidepanel.html
    sidepanel.css
    sidepanel.js
docs/
  architecture.md
```

## 실행 방법

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위 `Developer mode`를 켭니다.
3. `Load unpacked`를 누릅니다.
4. 이 프로젝트 폴더를 선택합니다.
5. MUSINSA 장바구니 페이지를 연 뒤 확장프로그램 아이콘을 누르면 오른쪽 패널이 열립니다.

## 개발 메모

MUSINSA의 실제 장바구니 상품은 현재 `data-item-list-id="cart_list"`와 `data-section-name="cart_list"`를 기준으로 읽습니다. 추천 상품 영역은 `cart_rec_*` 패턴이라 제외합니다.

상품이 비어 있거나 일부 필드가 비면 `src/content/parsers.js`의 MUSINSA 파서에 실제 페이지에서 확인한 `data-*` 속성이나 셀렉터를 추가하면 됩니다.
