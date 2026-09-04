# InMyCart

InMyCart는 쇼핑몰 장바구니에 담긴 아이템을 Chrome 오른쪽 Side Panel의 가방 UI 안에 시각적으로 담아 보여주는 실험용 확장프로그램입니다.

현재 MVP는 MUSINSA와 OLIVEYOUNG 장바구니 페이지를 지원합니다. 장바구니 데이터를 읽는 파서는 사이트별로 분리되어 있어 Coupang 같은 쇼핑몰도 나중에 추가할 수 있습니다.

## 지금 되는 것

- Chrome Manifest V3 확장프로그램 구조
- Chrome Side Panel UI
- MUSINSA / OLIVEYOUNG 장바구니 페이지 감지
- 실제 장바구니 영역인 `cart_list`만 읽고 추천 영역인 `cart_rec_one`, `cart_rec_two`는 제외
- 장바구니 상품명, 브랜드, 옵션, 가격, 수량, 이미지, 링크 추출
- 같은 상품이 썸네일/상품명 링크로 중복 잡히는 경우 `data-item-id` 기준으로 병합
- Matter.js 기반 My Bag 물리 공간: 테두리 박스 전체를 하나의 가방처럼 사용
- 장바구니 아이템 사진이 위에서 떨어지고, 서로 부딪히고, 가방 벽/바닥과 충돌
- 가방 안 상품 사진 드래그 및 던지기
- content script, background service worker, side panel 간 메시지 통신
- 사이트별로 마지막으로 읽은 장바구니를 chrome.storage.local에 보존하고, My Bag에서는 하나로 합쳐서 표시

## 폴더 구조

```text
manifest.json
package.json
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

현재 로컬 폴더에는 Matter.js 실행 파일을 이미 넣어두었습니다. GitHub에서 새로 받은 폴더라면 먼저 프로젝트 폴더에서 아래 명령을 한 번 실행하세요.

```bash
npm install
```

그 다음 Chrome에서 실행합니다.

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위 `Developer mode`를 켭니다.
3. `Load unpacked`를 누릅니다.
4. 이 프로젝트 폴더를 선택합니다.
5. MUSINSA나 OLIVEYOUNG 장바구니 페이지를 연 뒤 확장프로그램 아이콘을 누르면 오른쪽 패널이 열립니다.

코드를 고친 뒤에는 `chrome://extensions`에서 InMyCart 카드의 새로고침 버튼을 누르고, 장바구니 탭도 새로고침하면 됩니다.

## 개발 메모

MUSINSA의 실제 장바구니 상품은 현재 `data-item-list-id="cart_list"`와 `data-section-name="cart_list"`를 기준으로 읽습니다. 추천 상품 영역은 `cart_rec_*` 패턴이라 제외합니다. OLIVEYOUNG은 `.tbl_cont_area` 상품 행 안의 숨겨진 상품번호, 장바구니번호, 쿠폰 적용 가격, 이미지 경로를 우선 사용합니다.

상품이 비어 있거나 일부 필드가 비면 `src/content/parsers.js`의 해당 사이트 파서에 실제 페이지에서 확인한 `data-*` 속성이나 셀렉터를 추가하면 됩니다.

My Bag 물리 UI는 `src/sidepanel/sidepanel.js`의 Matter.js 월드에서 관리합니다. 상품 DOM은 Matter body의 위치와 각도를 매 프레임 따라가며, 테두리 박스의 바닥과 양쪽 벽은 보이지 않는 static body로 구성되어 있습니다.
