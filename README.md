# Cart Lens MVP

Chrome 오른쪽 Side Panel에서 쇼핑몰 장바구니 정보를 보여주는 실험용 확장프로그램입니다. 현재 MVP는 MUSINSA 장바구니 페이지를 우선 지원하고, 파서를 분리해 다른 쇼핑몰을 나중에 추가하기 쉽게 구성했습니다.

## 포함된 기능

- Chrome Manifest V3 확장프로그램 구조
- Chrome Side Panel UI
- MUSINSA 장바구니 페이지 감지
- 장바구니 상품명, 브랜드, 옵션, 가격, 수량, 이미지, 링크 추출 시도
- content script, background service worker, side panel 간 메시지 통신
- DOM 변경에 대응하기 위한 휴리스틱 파서 분리
- 로컬 요약 분석: 상품 수, 가격 합계, 가장 비싼 상품, 브랜드 수

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
4. 이 폴더를 선택합니다.
5. MUSINSA 장바구니 페이지를 연 뒤 확장프로그램 아이콘을 누르면 오른쪽 패널이 열립니다.

## 참고

MUSINSA의 실제 DOM은 로그인 상태, 국가/언어, 실험 UI에 따라 바뀔 수 있습니다. 그래서 현재 파서는 특정 CSS 클래스 하나에만 의존하지 않고 상품 링크, 가격 텍스트, 이미지, 장바구니 관련 컨테이너를 조합해서 읽습니다.

상품이 비어 있거나 일부 필드가 비면 `src/content/parsers.js`의 `parseMusinsaCart()` 안에 실제 페이지에서 확인한 셀렉터를 추가하면 됩니다.
