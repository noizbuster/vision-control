# Vision Control — Product Requirements Document

> **문서 유형:** Product Requirements Document + Technical Architecture + Boilerplating Execution Plan  
> **프로젝트 코드명:** Vision Control  
> **문서 버전:** 1.0.0  
> **작성 기준일:** 2026-07-02  
> **상태:** Implementation Ready Draft  
> **기본 언어:** TypeScript  
> **Monorepo:** pnpm Workspaces + Nx  
> **Code Quality:** Biome  
> **초기 대상:** Chromium 기반 브라우저, React, Vite, Next.js, Tailwind CSS, CSS Modules

---

## 0. 문서 목적

이 문서는 Vision Control을 빈 저장소에서 시작해 실제로 동작하는 개발자 도구로 보일러플레이팅하고, 이후 단계적으로 확장하기 위한 제품 요구사항과 기술 설계를 정의한다.

이 문서는 다음 용도로 사용한다.

1. 프로젝트의 제품 범위와 성공 기준을 합의한다.
2. Coding Agent가 저장소 구조와 작업 순서를 추측하지 않고 구현할 수 있게 한다.
3. 브라우저 확장 프로그램, 로컬 daemon, 소스 계측 플러그인, MCP 서버 사이의 책임 경계를 고정한다.
4. Figma와 유사한 시각적 편집 동작을 실제 HTML/CSS/컴포넌트 코드 변경 의도로 변환하는 방식을 정의한다.
5. 구현 단계별 산출물, 테스트, 완료 조건, 위험 요소를 명문화한다.

이 문서에서 말하는 “Figma식 편집”은 웹페이지를 별도의 캔버스로 복제하는 것을 뜻하지 않는다. 사용자가 **실제로 실행 중인 로컬 개발 웹페이지의 live DOM을 선택하고, 이동·재배치·리사이즈·정렬·간격·텍스트·스타일을 조작하는 편집 경험**을 뜻한다.

---

# 1. Executive Summary

Vision Control은 로컬 개발 서버에서 실행 중인 웹앱을 시각적으로 수정하고, 그 수정 내용을 Coding Agent가 실제 소스 코드에 반영할 수 있는 구조화된 컨텍스트로 변환하는 개발자 도구다.

사용자는 Chrome DevTools의 Vision Control 패널 또는 페이지 위 오버레이에서 요소를 선택한다. 선택한 요소의 스타일, 클래스, 텍스트, 크기, 정렬, 순서, 부모 컨테이너를 변경할 수 있다. Vision Control은 변경을 단순한 DOM mutation으로 저장하지 않고 다음 정보를 함께 기록한다.

- 사용자가 무엇을 변경했는가
- 어떤 요소 인스턴스를 변경했는가
- 해당 요소가 어느 컴포넌트와 소스 위치에서 생성되었는가
- 변경이 Flex, Grid, normal flow, absolute positioning 중 어떤 레이아웃 의미를 갖는가
- 반응형 조건과 디자인 토큰은 무엇인가
- 소스 코드에서 어떤 구현 후보가 적절한가
- Agent가 코드를 수정한 뒤 무엇을 기준으로 성공 여부를 검증해야 하는가

핵심 파이프라인은 다음과 같다.

```text
Live Web Page
  → Element Selection
  → Visual Edit / Drag / Resize / Reparent
  → Preview Transaction
  → Change Journal
  → Visual Intent IR
  → Source Resolution
  → Context Compilation
  → MCP / CLI / Agent Adapter
  → Coding Agent Source Patch
  → HMR / Reload
  → Runtime Verification
```

Vision Control은 자체 Coding Agent나 자체 IDE를 만드는 것이 1차 목표가 아니다. 다양한 Agent가 사용할 수 있는 **브라우저 기반 visual intent acquisition layer**가 되는 것이 목표다.

---

# 2. 문제 정의

## 2.1 현재 개발 흐름의 문제

프론트엔드 개발자는 브라우저 DevTools에서 다음과 같은 실험을 반복한다.

- padding, margin, gap 변경
- Tailwind class 교체
- 색상과 typography 조절
- Flex/Grid 정렬 변경
- 요소 순서 변경
- 컴포넌트를 다른 컨테이너로 이동하는 구조 실험
- 버튼이나 카드의 크기 조절
- 텍스트 교체
- 반응형 viewport별 확인

그러나 브라우저에서 성공한 실험 결과는 대부분 휘발된다. 개발자는 다음 과정을 수동으로 수행해야 한다.

1. 어떤 규칙을 바꿨는지 기억한다.
2. 해당 요소를 생성한 컴포넌트를 찾는다.
3. class가 정적 문자열인지, `cn()` 조합인지, CSS Module인지 확인한다.
4. 시각적 변화가 어떤 레이아웃 코드로 번역되어야 하는지 판단한다.
5. Agent에게 스크린샷, HTML, 설명을 따로 전달한다.
6. Agent가 비슷하지만 다른 요소를 수정하지 않았는지 확인한다.
7. 변경 결과를 다시 브라우저에서 비교한다.

현재의 일반적인 브라우저 MCP 도구는 Agent가 페이지를 읽고 조작하는 데 강하지만, **사람이 직접 만든 시각적 변경을 의미 보존된 변경 의도로 추출하는 것**에는 초점이 맞춰져 있지 않다.

## 2.2 해결해야 할 핵심 난제

1. live DOM 요소를 원본 JSX/TSX/CSS 위치와 연결해야 한다.
2. 임시 화면 이동을 실제 반응형 레이아웃 코드로 해석해야 한다.
3. 같은 부모 내부의 순서 변경과 다른 부모로의 reparent를 구분해야 한다.
4. `transform: translate()` 미리보기와 실제 `gap`, `order`, DOM 순서 변경을 구분해야 한다.
5. 소스 코드 구조가 동적이어도 Agent가 이해할 수 있는 증거를 제공해야 한다.
6. 사용자의 페이지에 영향을 주지 않는 격리된 편집 UI가 필요하다.
7. 입력값, 토큰, 쿠키, 네트워크 헤더 등 민감한 정보를 Agent에 보내지 않아야 한다.
8. HMR 후 DOM 인스턴스가 바뀌어도 검증 대상을 다시 찾아야 한다.

---

# 3. 제품 비전

## 3.1 Vision Statement

> 브라우저에서 “이렇게 보이고 동작했으면 좋겠다”를 직접 조작하면, Vision Control이 그 의도를 소스 코드에 연결된 명확한 변경 요청으로 변환한다.

## 3.2 핵심 제품 원칙

### P1. Visual-first, code-aware

시작점은 화면이지만 결과는 항상 코드와 연결되어야 한다.

### P2. Layout-aware, not pixel-only

좌표 차이만 기록하지 않는다. 가능한 경우 Flex/Grid/flow/spacing/reparent 의미로 해석한다.

### P3. Preview is reversible

모든 편집은 명시적인 transaction이며 undo/redo와 원상 복구가 가능해야 한다.

### P4. Agent-neutral

MCP, CLI, JSON export를 통해 특정 Agent 제품에 종속되지 않는다.

### P5. Local-first and least privilege

기본 동작은 로컬호스트와 명시적으로 허용된 origin에서만 수행한다.

### P6. Evidence over guessing

소스 위치, DOM snapshot, computed style, screenshot, 변경 전후 값을 증거로 전달한다. 낮은 신뢰도는 숨기지 않는다.

### P7. Deterministic operations first

정적 class 교체, 명확한 CSS 선언 변경 등은 deterministic patch 후보로 표시한다. 동적인 경우 Agent 추론에 맡긴다.

### P8. Human controls commit

Agent에 컨텍스트를 전달하거나 실제 소스 변경을 허용하는 시점은 사용자가 통제한다.

---

# 4. 목표와 비목표

## 4.1 제품 목표

- 로컬 개발 페이지에서 요소 선택 및 구조 탐색
- 스타일·클래스·텍스트·속성 수정
- Figma식 이동, 리사이즈, 정렬, 간격 편집
- 같은 컨테이너 내 reorder
- 서로 다른 컨테이너 간 reparent
- 다중 선택과 그룹 편집
- 변경 이력과 undo/redo
- 변경 전후 visual intent를 구조화된 IR로 저장
- React JSX/TSX 원본 위치 매핑
- Tailwind, CSS Modules, 일반 CSS 소스 해석
- MCP와 CLI를 통한 Agent 컨텍스트 제공
- Agent 변경 후 runtime 검증
- Nx 기반 확장 가능한 monorepo와 명확한 package boundary

## 4.2 초기 비목표

- 완전한 Figma 대체
- 디자인 파일 자체의 import/export
- 프로덕션 사이트 무단 편집
- 모든 JavaScript framework 동시 지원
- 임의의 DOM 변경을 항상 완벽한 소스 patch로 자동 변환
- 브라우저 내부 React Fiber 비공개 구조에 대한 강한 의존
- 모든 CSS-in-JS 라이브러리 지원
- 다중 사용자 실시간 공동 편집
- Agent가 사용자 승인 없이 저장소를 직접 수정하는 기능
- HTML canvas 내부 객체의 일반화된 편집
- WebGL 장면 편집

---

# 5. 대상 사용자

## 5.1 Primary Persona: Frontend Developer

- React, Next.js, Tailwind 기반 프로젝트를 개발한다.
- 브라우저 DevTools에서 스타일을 자주 실험한다.
- Coding Agent를 사용하지만 화면 변경 의도를 설명하는 데 시간이 든다.
- 디자인 토큰과 반응형 레이아웃을 깨뜨리지 않는 수정이 필요하다.

## 5.2 Secondary Persona: Product Engineer / Product Manager

- 구현 중인 화면에서 컴포넌트 순서, 간격, 문구를 직접 시도한다.
- 변경을 코드 수준의 명확한 작업으로 개발자 또는 Agent에게 넘기고 싶다.

## 5.3 Secondary Persona: UI/UX Designer with Code Access

- 개발 빌드에서 실제 컴포넌트의 제약을 보며 조정한다.
- 픽셀 좌표보다 responsive layout intent를 전달하고 싶다.

---

# 6. 대표 사용자 시나리오

## UC-01 스타일 변경

1. 사용자가 버튼을 선택한다.
2. 패널에서 background token과 horizontal padding을 변경한다.
3. 페이지에는 즉시 preview가 적용된다.
4. Change Journal에 class 또는 CSS property 변경이 기록된다.
5. Agent가 해당 `className` 표현식을 수정한다.
6. HMR 후 computed style이 목표값과 일치하는지 검증한다.

## UC-02 같은 Flex 컨테이너에서 순서 변경

1. 사용자가 카드 목록의 세 번째 카드를 드래그한다.
2. Vision Control이 부모가 `display:flex`이며 주축이 세로임을 감지한다.
3. 카드 사이에 insertion indicator를 표시한다.
4. drop 시 임시 DOM 순서를 변경한다.
5. 변경 의도는 `translateY`가 아니라 `reorder-child`로 기록된다.
6. Agent는 JSX 배열 순서, 정적 child 순서, `order` 속성 중 소스 문맥에 맞는 구현을 선택한다.

## UC-03 다른 컨테이너로 이동

1. 사용자가 Sidebar의 버튼을 Header actions 컨테이너로 드래그한다.
2. 후보 drop container에 outline과 수용 가능 여부가 표시된다.
3. drop 시 element instance가 preview DOM에서 새 부모로 이동한다.
4. Change Journal은 source parent와 target parent의 source identity를 함께 기록한다.
5. Portal, 반복 렌더링, component ownership 위험이 있으면 low-confidence 경고를 표시한다.
6. Agent는 JSX subtree 이동 또는 컴포넌트 호출 위치 이동을 수행한다.

## UC-04 Figma식 크기 조절

1. 사용자가 카드 우측 handle을 드래그한다.
2. 드래그 동안 visual transform 또는 임시 width가 적용된다.
3. Layout Engine이 카드가 flex item인지 grid item인지 분석한다.
4. drop 시 다음 후보를 제시한다.
   - fixed width
   - flex-basis
   - grid span
   - width: 100%
   - max-width token
5. 사용자의 선택 또는 자동 추천을 Visual Intent에 저장한다.

## UC-05 Auto Layout 형태의 컨테이너 편집

1. 사용자가 컨테이너를 선택한다.
2. Layout 패널에서 direction, gap, padding, alignment, wrap을 변경한다.
3. Figma의 Hug/Fill/Fixed에 해당하는 sizing intent를 선택한다.
4. Vision Control은 CSS 문맥에 맞게 `fit-content`, `flex:1`, `align-self:stretch`, 명시적 width 등의 후보로 변환한다.

## UC-06 Agent 수정 실패 반복

1. Agent가 코드를 변경했지만 시각 결과가 목표와 다르다.
2. Vision Control이 assertion 실패와 screenshot diff를 수집한다.
3. 실패 컨텍스트만 압축해 Agent에 다시 제공한다.
4. 사용자는 preview 목표 상태를 유지한 채 재시도를 요청한다.

---

# 7. 기능 범위

## 7.1 MVP

- Chromium DevTools panel
- 페이지 overlay element picker
- 단일 요소 선택
- DOM ancestry/breadcrumb
- computed style, box model, class 목록
- inline preview stylesheet
- class add/remove/replace
- inline style/property edit
- text edit
- Change Journal + undo/redo
- same-parent Flex/normal-flow reorder
- cross-parent reparent preview
- basic resize handles
- source marker 기반 React/Vite 소스 매핑
- daemon WebSocket 연결
- JSON/Markdown context export
- MCP read-only tools
- HMR 후 기본 assertion 검증

## 7.2 V1

- multi-select
- group move
- alignment/distribution
- Auto Layout 패널
- CSS Grid reorder/span
- Tailwind token-aware editing
- CSS Modules mapping
- Next.js integration
- breakpoint-specific edit
- element screenshot crop
- source confidence UI
- deterministic patch suggestions
- Pi/OpenCode adapter examples

## 7.3 V2+

- Vue/Svelte adapters
- CSS-in-JS adapters
- pseudo element editing
- component props editing
- design token registry
- collaboration/session sharing
- optional direct codemod
- Firefox support
- accessibility repair suggestions

---

# 8. UX 및 화면 구성

## 8.1 DevTools Panel 레이아웃

```text
┌──────────────────────────────────────────────────────────────────┐
│ Toolbar: Select | Move | Resize | Text | Layout | Screenshot     │
├──────────────┬──────────────────────────────┬────────────────────┤
│ Layers / DOM │ Selection Summary            │ Properties         │
│ Tree         │ Source / Component           │ Layout             │
│              │ Change Preview               │ Style              │
│              │ Screenshot                   │ Typography         │
│              │ Agent Instruction            │ Attributes         │
├──────────────┴──────────────────────────────┴────────────────────┤
│ Change Journal | Verification | Agent Context | Diagnostics       │
└──────────────────────────────────────────────────────────────────┘
```

패널이 좁을 때는 좌측 DOM tree와 우측 properties를 tab 또는 drawer로 축소한다.

## 8.2 페이지 Overlay

Overlay는 inspected page의 CSS와 충돌하지 않도록 Shadow DOM에 렌더링한다.

표시 요소:

- hover outline
- selected outline
- parent/container outline
- margin/padding visualization
- flex/grid axis indicator
- resize handles
- rotation handle은 초기 비활성
- insertion line
- drop container highlight
- snapping guides
- selection label
- source confidence badge
- 변경된 요소 badge
- drag ghost 또는 placeholder

Overlay에는 `pointer-events`를 상황별로 전환한다.

- inspect 대기 중: overlay root는 pointer event 통과, hover listener는 capture phase에서 처리
- handle 조작 중: handle만 pointer event 수신
- drag 중: pointer capture로 이동 이벤트 유지
- screenshot 중: overlay 숨김

## 8.3 기본 편집 모드

### Inspect Mode

- hover로 요소 탐색
- click으로 선택
- `Esc` 선택 해제 또는 상위 모드 종료
- `Enter` 선택 고정
- `Alt`를 누르면 부모 후보 순환

### Move Mode

- 선택 요소를 드래그해 reorder 또는 reparent
- normal flow 요소는 자유 좌표로 즉시 고정 배치하지 않는다.
- `Alt/Option` 드래그는 duplicate intent
- `Shift`는 축 제한
- `Cmd/Ctrl`은 snapping 임시 해제

### Resize Mode

- 8방향 handle
- 기본은 width/height 또는 layout-specific sizing intent
- `Shift`는 aspect ratio 유지
- `Alt/Option`은 중심 기준 resize

### Text Mode

- text node 또는 text-bearing element 선택
- overlay editor에서 수정
- 앱 자체 input event와 분리
- 원본 문자열, 번역 키 가능성, 렌더링 source를 기록

### Layout Mode

- container direction
- gap
- padding
- alignment
- distribution
- wrap
- child sizing behavior
- grid template 및 span

---

# 9. Figma식 편집 기능 상세 요구사항

## 9.1 선택 모델

### 단일 선택

선택 정보는 다음을 포함한다.

```ts
interface SelectionIdentity {
  sessionId: string;
  frameId: string;
  runtimeId: string;
  sourceId?: string;
  stableSelector: string;
  fallbackSelector?: string;
  domPathFingerprint: string;
  componentName?: string;
  sourceLocation?: SourceLocation;
}
```

### 다중 선택

- `Shift+Click`으로 추가/제거
- drag marquee selection은 Selecto 또는 자체 selection rectangle을 검토한다.
- 서로 다른 iframe 또는 shadow root의 요소는 하나의 transform group으로 묶지 않는다.
- 다중 선택은 공통 부모, 공통 layout context, bounding rectangle을 계산한다.

### Layer Tree

- DOM tree와 component/source tree를 전환 가능하게 한다.
- 숨김 요소, pseudo element, text node 표시 옵션을 둔다.
- Portal과 Shadow DOM boundary를 시각적으로 표시한다.

## 9.2 이동의 세 가지 의미

모든 drag는 아래 세 의미 중 하나로 확정되어야 한다.

### A. Reorder

동일 부모 내부에서 sibling 순서 변경.

```ts
interface ReorderChildOperation {
  kind: "reorder-child";
  parent: ElementRef;
  child: ElementRef;
  fromIndex: number;
  toIndex: number;
  axis: "horizontal" | "vertical" | "grid";
  implementationHints: Array<"jsx-order" | "array-order" | "css-order">;
}
```

### B. Reparent

부모 컨테이너 변경.

```ts
interface ReparentElementOperation {
  kind: "reparent-element";
  target: ElementRef;
  fromParent: ElementRef;
  toParent: ElementRef;
  fromIndex: number;
  toIndex: number;
  sourceOwnershipRisk: "low" | "medium" | "high";
  requiredPropFlowChanges?: string[];
}
```

### C. Free-position

요소가 positioned context에 있거나 사용자가 명시적으로 자유 배치를 선택한 경우 좌표 기반 이동.

```ts
interface PositionElementOperation {
  kind: "position-element";
  target: ElementRef;
  positioning: "absolute" | "fixed" | "relative-offset" | "transform";
  containingBlock: ElementRef;
  before: PositionSnapshot;
  after: PositionSnapshot;
}
```

normal flow 요소를 드래그했다고 해서 자동으로 `position:absolute`로 바꾸면 안 된다. free-position은 명시적인 intent 또는 기존 positioned context에서만 기본 허용한다.

## 9.3 Drag Lifecycle

```text
pointerdown
  → interaction candidate
  → drag threshold exceeded
  → snapshot selection and layout
  → create overlay ghost
  → pointer capture
  → continuous hit testing
  → calculate candidate drop intents
  → render insertion/drop preview
  → pointerup
  → validate operation
  → commit preview transaction
  → append journal entry
```

### Drag Start Snapshot

- target `getBoundingClientRect()`
- computed style
- transform matrix
- scroll offsets
- offsetParent / containing block
- parent layout mode
- sibling rects
- source identities
- DOM subtree hash
- active responsive breakpoint

### Hit Testing

`document.elementsFromPoint()`를 사용하되 overlay element를 제외한다.

후보 container 필터:

- target 자신의 descendant가 아님
- 금지된 HTML content model이 아님
- display:none이 아님
- visibility:hidden이 아님
- pointer hit 영역이 유효함
- 편집 잠금 상태가 아님
- cross-origin iframe이 아님
- SVG/HTML namespace가 호환됨

### Insertion Index 결정

#### 수직 Flex/Block

pointer Y와 sibling midpoint 비교.

#### 수평 Flex

pointer X와 sibling midpoint 비교.

#### Grid

- grid cell rectangle 추정
- explicit grid line 또는 nearest cell 계산
- DOM 순서 변경과 `grid-area` 변경 후보를 분리

#### Absolute Container

- pointer를 containing block local coordinate로 변환
- snapping 및 constraint 적용

## 9.4 Reparent 안전성 검사

다음 조건에서는 즉시 commit하지 않고 경고 또는 Agent-only intent로 기록한다.

- React Portal 경계
- `<table>`, `<tr>`, `<tbody>` content model 위반
- `<ul>/<ol>`과 `<li>` 구조 위반
- `<select>/<option>` 구조 위반
- form ownership 변경 가능성
- `<label>` 연관성 변경
- slot/Shadow DOM 경계
- 반복 렌더링된 instance 하나만 이동하려는 경우
- target source가 render prop 내부에 있는 경우
- target component가 필요한 context provider 밖으로 이동하는 경우
- source parent와 target parent가 서로 다른 파일이고 prop dependency가 존재하는 경우
- server/client component boundary 변경 가능성

Reparent operation에는 runtime 성공 여부와 source-level feasibility를 별도로 둔다.

```ts
interface FeasibilityReport {
  runtimePreview: "valid" | "invalid";
  sourcePatch: "deterministic" | "agent-required" | "unsafe";
  reasons: string[];
  confidence: number;
}
```

## 9.5 Resize Engine

### Layout Classification

요소를 다음 중 하나로 분류한다.

```ts
type LayoutRole =
  | "normal-flow-block"
  | "inline"
  | "inline-block"
  | "flex-container"
  | "flex-item"
  | "grid-container"
  | "grid-item"
  | "absolute-positioned"
  | "fixed-positioned"
  | "replaced-element"
  | "svg-element"
  | "unknown";
```

### Resize 결과 후보

- `width` / `height`
- `min-width` / `max-width`
- `min-height` / `max-height`
- `flex-basis`
- `flex-grow`
- `align-self: stretch`
- `grid-column` span
- `grid-row` span
- `aspect-ratio`
- image intrinsic sizing
- Tailwind sizing class
- design token

### Drag 중 Preview

성능을 위해 매 pointermove마다 소스 의미를 확정하지 않는다.

1. RAF 단위로 bounding preview를 갱신한다.
2. 기본적으로 임시 CSS variable 또는 transform을 사용한다.
3. pointerup 시 Layout Resolver가 semantic candidate를 계산한다.
4. 최종 preview를 semantic CSS로 재적용한다.
5. 사용자는 candidate를 선택하거나 자동 추천을 수락한다.

## 9.6 Auto Layout 대응

Figma 용어를 그대로 코드로 쓰지 않고 UI 개념으로만 제공한다.

### Direction

- Horizontal → `flex-direction: row`
- Vertical → `flex-direction: column`

### Gap

- row/column gap 분리 지원
- Tailwind spacing scale 또는 CSS variable 추천

### Padding

- all
- horizontal/vertical
- independent sides

### Alignment

- main axis: start, center, end, space-between, space-around, space-evenly
- cross axis: start, center, end, stretch, baseline

### Sizing Intent

```ts
type SizingIntent = "hug" | "fill" | "fixed";
```

#### Hug

문맥별 후보:

- `width:auto`
- `width:fit-content`
- `max-content`
- inline formatting

#### Fill

문맥별 후보:

- `flex:1 1 0%`
- `width:100%`
- `align-self:stretch`
- grid stretch

#### Fixed

- explicit px/rem/token value
- min/max constraint를 함께 기록 가능

Vision Control은 Hug/Fill을 CSS property 하나로 단정하지 않는다. Layout Resolver가 parent context를 이용해 구현 후보를 생성한다.

## 9.7 정렬 및 분배

다중 선택 또는 container children에 대해:

- left/center/right align
- top/middle/bottom align
- horizontal distribute
- vertical distribute
- equal gap
- match width/height

normal-flow sibling에 대한 정렬은 좌표 이동이 아니라 parent layout property 변경 또는 child alignment로 표현한다.

## 9.8 Snap System

snapping 후보:

- parent edge/center
- sibling edge/center
- baseline
- grid line
- spacing token
- 4px/8px configurable grid
- design token value

```ts
interface SnapCandidate {
  kind: "edge" | "center" | "baseline" | "grid" | "spacing-token";
  axis: "x" | "y";
  value: number;
  source?: ElementRef;
  token?: string;
  distance: number;
}
```

## 9.9 텍스트 편집

- 실제 application input에 key event를 보내지 않는 overlay editor 사용
- text node가 여러 개이면 편집 대상을 명시
- i18n 함수 호출로 생성된 텍스트인지 source resolver가 추정
- 번역 key 기반이면 문자열 직접 변경 대신 key/resource 변경 후보 생성
- contentEditable 요소는 앱의 기존 편집 상태와 충돌 가능성을 경고

## 9.10 구조 편집 명령

- duplicate
- delete
- wrap in container
- unwrap
- group selection
- create stack/flex container
- move to front/back은 positioned context에서만 지원
- convert layout to flex/grid는 명시적인 고급 명령

각 구조 명령은 inverse operation을 가져야 한다.

---

# 10. Interaction State Machine

복잡한 pointer interaction은 boolean state 조합으로 관리하지 않는다. 명시적인 state machine을 사용한다. XState 사용 여부는 구현 단계에서 결정할 수 있지만, 상태 모델은 아래와 동등해야 한다.

```text
idle
├── hovering
├── selected
│   ├── editingStyle
│   ├── editingText
│   ├── preparingDrag
│   ├── dragging
│   │   ├── reorderPreview
│   │   ├── reparentPreview
│   │   └── freePositionPreview
│   ├── resizing
│   ├── marqueeSelecting
│   └── awaitingCommit
├── verifying
└── disconnected
```

상태 전환은 telemetry와 debug log에 기록한다.

상태 machine이 보장해야 하는 invariant:

- 한 번에 하나의 pointer-owning interaction만 활성화
- drag 중 source selection 변경 금지
- preview transaction은 commit 또는 rollback 중 하나로 종료
- iframe navigation 시 활성 interaction 취소
- page reload 시 stale runtime ID 폐기

---

# 11. 좌표계 및 Geometry

Vision Control은 다음 좌표계를 구분해야 한다.

- viewport/client coordinates
- document/page coordinates
- frame-local coordinates
- scroll container coordinates
- offsetParent coordinates
- transformed local coordinates
- device pixel coordinates for screenshots

```ts
interface Point {
  x: number;
  y: number;
}

interface GeometrySnapshot {
  clientRect: DOMRectLike;
  pageRect: DOMRectLike;
  transformMatrix: number[];
  transformOrigin: Point;
  scrollParents: ScrollParentSnapshot[];
  containingBlockRuntimeId?: string;
  devicePixelRatio: number;
}
```

CSS transform이 적용된 ancestor가 있으면 `DOMMatrix`를 사용해 pointer 좌표를 local coordinate로 변환한다.

Zoom과 browser DevTools docking에 의한 viewport 변화를 처리한다.

---

# 12. Change Journal 및 Visual Intent IR

## 12.1 Event-sourced Journal

모든 변경은 event와 inverse event를 함께 저장한다.

```ts
interface JournalEntry<T extends VisualOperation = VisualOperation> {
  id: string;
  transactionId: string;
  sequence: number;
  createdAt: string;
  actor: "human" | "agent" | "system";
  operation: T;
  inverse: VisualOperation;
  preconditions: RuntimeAssertion[];
  evidence: EvidenceRef[];
  status: "preview" | "committed" | "superseded" | "reverted";
}
```

## 12.2 ChangeSet

```ts
interface ChangeSet {
  schemaVersion: string;
  id: string;
  workspaceId: string;
  sessionId: string;
  page: PageContext;
  viewport: ViewportContext;
  createdAt: string;
  updatedAt: string;
  title?: string;
  userInstruction?: string;
  selectedTargets: ElementRef[];
  operations: VisualOperation[];
  sourceResolutions: SourceResolution[];
  verificationPlan: VerificationPlan;
  privacyReport: PrivacyReport;
}
```

## 12.3 Operation Union

```ts
type VisualOperation =
  | SetStyleOperation
  | RemoveStyleOperation
  | ReplaceClassOperation
  | AddClassOperation
  | RemoveClassOperation
  | SetAttributeOperation
  | SetTextOperation
  | ReorderChildOperation
  | ReparentElementOperation
  | PositionElementOperation
  | ResizeElementOperation
  | SetContainerLayoutOperation
  | SetChildSizingOperation
  | InsertElementOperation
  | RemoveElementOperation
  | DuplicateElementOperation
  | WrapElementsOperation
  | UnwrapElementOperation;
```

## 12.4 Operation 공통 필드

```ts
interface OperationBase {
  id: string;
  target: ElementRef;
  breakpoint?: BreakpointContext;
  pseudoState?: ":hover" | ":focus" | ":active" | ":disabled";
  origin: "property-panel" | "canvas-drag" | "shortcut" | "agent";
  confidence: number;
  notes?: string[];
}
```

## 12.5 Runtime Operation과 Source Intent 분리

한 operation에는 다음 두 층을 둔다.

```ts
interface CompiledVisualOperation {
  runtimeMutation: RuntimeMutation;
  sourceIntent: SourceIntent;
}
```

예를 들어 카드 drag 중 runtime에는 transform이 적용될 수 있지만 source intent는 reorder다.

```json
{
  "runtimeMutation": {
    "kind": "temporary-transform",
    "translateY": 84
  },
  "sourceIntent": {
    "kind": "reorder-child",
    "fromIndex": 2,
    "toIndex": 1
  }
}
```

---

# 13. Preview Engine

## 13.1 원칙

- 앱 소스를 즉시 수정하지 않는다.
- preview mutation은 원상 복구 가능해야 한다.
- 앱의 framework reconciliation에 의해 preview가 사라지는 경우 다시 적용할 수 있어야 한다.
- preview CSS는 높은 specificity를 사용하되 원본 source intent와 분리한다.

## 13.2 Preview Layer

```text
PreviewManager
├── StylePreviewAdapter
├── ClassPreviewAdapter
├── TextPreviewAdapter
├── StructuralPreviewAdapter
├── TransformPreviewAdapter
└── ReconciliationObserver
```

## 13.3 Style Preview

```css
[data-vc-runtime-id="runtime-123"] {
  --vc-preview-width: 320px;
  width: var(--vc-preview-width) !important;
}
```

property별 `!important` 필요 여부를 기록한다. 원본 선언에 important가 있거나 layer/specificity로 인해 preview가 적용되지 않을 경우 diagnostics를 표시한다.

## 13.4 Structural Preview

reorder/reparent는 `Node.insertBefore()` 또는 `append()`로 runtime DOM을 이동할 수 있다. React reconciliation이 원래 위치로 복구할 수 있으므로 다음 정책을 사용한다.

1. pointerup 직후 사용자에게 시각 결과를 보여준다.
2. MutationObserver로 rollback 여부를 감지한다.
3. framework가 되돌리면 overlay ghost/placeholder 기반 simulated preview로 전환한다.
4. operation 자체는 유지한다.
5. source patch 후 실제 DOM 변경으로 검증한다.

## 13.5 Preview Transaction

```ts
interface PreviewTransaction {
  id: string;
  operations: VisualOperation[];
  apply(): Promise<void>;
  rollback(): Promise<void>;
  commitToJournal(): Promise<void>;
}
```

---

# 14. Source Instrumentation 및 Source Mapping

## 14.1 Source Marker

개발 빌드에서 host JSX element에 opaque source ID를 주입한다.

```tsx
<button data-vc-source="s_9f2c1" className="px-3 py-2">
  Save
</button>
```

DOM에는 절대 파일 경로를 노출하지 않는다.

source registry:

```ts
interface SourceRegistryRecord {
  sourceId: string;
  workspaceRelativePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  componentName?: string;
  elementName: string;
  astFingerprint: string;
  classExpressionRange?: SourceRange;
  textExpressionRange?: SourceRange;
}
```

## 14.2 Runtime ID

동일 JSX가 반복 렌더링될 수 있으므로 source ID와 runtime ID를 분리한다.

```html
<div data-vc-source="s_card" data-vc-runtime-id="r_card_product_927">
```

runtime ID는 content script가 WeakMap과 attribute를 통해 관리한다.

## 14.3 Instrumentation Pipeline

React/Vite 초기 구현:

1. Vite transform hook에서 `.jsx`/`.tsx` 파싱
2. Babel parser로 AST 생성
3. host JSX opening element 식별
4. file path + source range + AST fingerprint로 source ID 생성
5. attribute 주입
6. source registry manifest 업데이트
7. 원래 source map과 결합된 map 반환

Babel parser와 traverse는 JSX/TSX AST 탐색과 변환에 사용한다. 변환 후 comment와 source map 보존을 검증한다.

## 14.4 Next.js Adapter

Next.js는 빌드 파이프라인 차이와 Server/Client Component 경계를 고려한다.

초기 지원 전략:

- client-rendered host element source marker
- 개발 모드 전용 transform
- server-rendered HTML에도 marker가 남도록 가능한 compilation path 지원
- `'use client'` boundary 기록
- Route Segment와 file path 기록
- hydration mismatch를 만들지 않는 deterministic attribute 사용

## 14.5 Source Resolution 우선순위

1. instrumented source marker
2. CSS Module manifest
3. static class token AST origin
4. source map
5. component framework adapter
6. stylesheet URL + selector mapping
7. workspace text/AST search
8. LLM inference

```ts
interface SourceResolution {
  target: ElementRef;
  candidates: SourceCandidate[];
  selectedCandidate?: SourceCandidate;
  confidence: number;
  method: SourceResolutionMethod;
  warnings: string[];
}
```

---

# 15. CSS 및 Styling Adapter

## 15.1 Tailwind Adapter

지원 기능:

- class token parsing
- static string token origin
- `cn`, `clsx`, `cva` 표현식 분석
- responsive prefix
- state variant
- arbitrary value
- spacing/color/typography token suggestion
- conflicting utility detection

예:

```tsx
className={cn(
  "flex items-center gap-2 px-3",
  active && "bg-blue-500",
  props.className,
)}
```

각 token에 origin을 연결한다.

```ts
interface ClassTokenOrigin {
  token: string;
  file: string;
  range: SourceRange;
  condition?: string;
  confidence: number;
}
```

동적 `props.className`에서 온 값은 소스 자동 교체 대상으로 확정하지 않는다.

## 15.2 CSS Modules Adapter

- runtime hashed class → local class name manifest
- local class → CSS file/source range
- composed class 추적
- source map으로 SCSS 원본 연결

## 15.3 Vanilla CSS/SCSS Adapter

- matched selector
- stylesheet URL
- cascade layer
- specificity
- media query
- source range
- CSS custom property origin

## 15.4 Inline Style Adapter

React style object가 정적이면 AST range를 연결한다.

```tsx
style={{ paddingInline: 12 }}
```

동적 object spread이면 후보와 위험을 표시한다.

## 15.5 CSS-in-JS

초기 범위 밖이지만 adapter contract는 미리 정의한다.

```ts
interface StylingAdapter {
  id: string;
  canHandle(context: StylingContext): Promise<boolean>;
  resolveOrigins(context: StylingContext): Promise<StyleOrigin[]>;
  compileIntent(operation: VisualOperation): Promise<SourceEditCandidate[]>;
}
```

---

# 16. Context Compiler

## 16.1 목표

전체 DOM이나 전체 저장소를 전달하지 않고 Agent가 수정하기에 충분한 최소 문맥을 생성한다.

## 16.2 포함 정보

- user instruction
- route, URL, viewport, DPR
- 선택 요소 semantic summary
- source candidate와 confidence
- operation 전후 값
- parent layout context
- sibling summary
- relevant JSX/CSS snippets
- screenshot crop
- verification assertions
- warnings and ambiguity

## 16.3 제외/마스킹 정보

- password field 값
- cookie
- authorization headers
- localStorage/sessionStorage 전체
- secret-like strings
- hidden form values
- unrelated DOM
- unrelated network response

## 16.4 Markdown Context 예

```md
## Goal
Move the secondary action from the sidebar footer to the header action group.

## Target
- Runtime: r_312
- Source: src/features/settings/SecondaryAction.tsx:18
- Component: SecondaryAction

## Structural Change
- From parent: SidebarFooter, child index 1
- To parent: HeaderActions, insertion index 0

## Risks
- The component consumes SidebarContext.
- Target parent is rendered in another source file.

## Verification
- HeaderActions contains a button named "Reset".
- SidebarFooter no longer contains that button.
- No console error after HMR.
```

## 16.5 Token Budget

context compiler는 우선순위 기반으로 내용을 축약한다.

1. operations
2. selected source snippets
3. parent/target source snippets
4. verification
5. screenshot
6. optional diagnostics

---

# 17. Agent Integration

## 17.1 MCP Server

MCP tools는 구조화된 schema를 갖고 모델이 호출할 수 있게 한다. 실제 source mutation tool은 초기에는 제공하지 않거나 사용자 승인을 요구한다.

### Read Tools

- `vision_get_active_session`
- `vision_get_selection`
- `vision_get_changeset`
- `vision_get_source_context`
- `vision_get_verification_plan`
- `vision_capture_element`
- `vision_get_diagnostics`

### Action Tools

- `vision_request_verification`
- `vision_clear_preview`
- `vision_mark_patch_started`
- `vision_mark_patch_completed`

### 향후 승인형 Tool

- `vision_apply_deterministic_patch`

MCP tool 호출은 UI에 표시하고, source-changing operation은 명시적 승인 흐름을 둔다.

## 17.2 CLI

```bash
vision-control daemon
vision-control status
vision-control sessions list
vision-control context current --format markdown
vision-control context current --format json
vision-control changes current
vision-control verify current
vision-control preview clear
vision-control doctor
```

## 17.3 Adapter

- OpenCode MCP config example
- Pi extension wrapper
- Claude Code MCP config example
- generic stdio MCP
- JSON file export

---

# 18. Verification Engine

## 18.1 검증 유형

- target existence
- text content
- class presence/absence
- computed style
- parent relationship
- sibling order
- bounding rect tolerance
- accessibility role/name
- console error absence
- screenshot crop similarity

## 18.2 Verification Plan

```ts
interface VerificationPlan {
  pageReady: PageReadyCondition;
  targetResolvers: TargetResolver[];
  assertions: RuntimeAssertion[];
  screenshotComparisons: ScreenshotAssertion[];
  consolePolicy: ConsolePolicy;
  timeoutMs: number;
}
```

## 18.3 HMR 후 Target 재식별

우선순위:

1. source ID
2. stable accessibility role/name
3. stable selector
4. DOM fingerprint
5. nearby source-marked ancestor + relative path

## 18.4 Layout Tolerance

브라우저 렌더링 차이를 고려해 px exact match만 사용하지 않는다.

```ts
interface NumericExpectation {
  expected: number;
  tolerance: number;
  unit: "px" | "ratio";
}
```

---

# 19. 시스템 아키텍처

```text
┌─────────────────────────────────────────────────────────────┐
│ Chromium DevTools                                           │
│  ┌───────────────────────┐  ┌────────────────────────────┐ │
│  │ Vision Control Panel  │  │ Elements Sidebar (optional)│ │
│  └───────────┬───────────┘  └────────────────────────────┘ │
│              │ extension messaging                          │
│  ┌───────────▼────────────────────────────────────────────┐ │
│  │ Background Service Worker                             │ │
│  └───────────┬────────────────────────────────────────────┘ │
│              │                                              │
│  ┌───────────▼────────────────────────────────────────────┐ │
│  │ Content Script / Overlay / Runtime Inspector          │ │
│  └───────────┬────────────────────────────────────────────┘ │
└──────────────┼──────────────────────────────────────────────┘
               │ authenticated WebSocket
┌──────────────▼──────────────────────────────────────────────┐
│ Local Daemon                                               │
│ Session | Registry | Workspace Index | Storage | Security   │
│ Context Compiler | Verification Coordinator                 │
├─────────────────┬────────────────────┬──────────────────────┤
│ MCP stdio/HTTP  │ CLI                │ Build Integrations    │
└─────────────────┴────────────────────┴──────────────────────┘
                                  ▲
                                  │ source registry updates
                         Vite / Next plugin
```

---

# 20. pnpm + Nx Monorepo 설계

## 20.1 Workspace Style

pnpm workspace가 package linking과 dependency ownership을 담당하고, Nx가 project graph, task orchestration, caching, affected execution을 담당한다.

각 publishable 또는 independently testable unit은 자체 `package.json`을 가진다. Nx project metadata는 `project.json` 또는 `package.json#nx`를 사용하되 저장소 전체에서 한 방식을 일관되게 적용한다. 본 문서는 가독성을 위해 각 project에 `project.json`을 두는 방식을 권장한다.

## 20.2 디렉터리 구조

```text
vision-control/
├── apps/
│   ├── extension/
│   ├── daemon/
│   ├── docs/
│   ├── playground-react-vite/
│   ├── playground-next/
│   └── visual-regression-lab/
│
├── packages/
│   ├── protocol/
│   ├── change-ir/
│   ├── element-identity/
│   ├── geometry/
│   ├── inspector-core/
│   ├── overlay-ui/
│   ├── editor-core/
│   ├── interaction-machine/
│   ├── layout-engine/
│   ├── preview-engine/
│   ├── change-journal/
│   ├── source-registry/
│   ├── source-resolver/
│   ├── workspace-index/
│   ├── context-compiler/
│   ├── verification-engine/
│   ├── daemon-client/
│   ├── daemon-core/
│   ├── storage/
│   ├── security/
│   ├── mcp-server/
│   ├── cli/
│   ├── logger/
│   ├── testing/
│   └── shared-ui/
│
├── integrations/
│   ├── vite-react/
│   ├── next-react/
│   ├── tailwind/
│   ├── css-modules/
│   ├── vanilla-css/
│   ├── opencode/
│   └── pi/
│
├── tools/
│   ├── nx-plugin/
│   ├── generators/
│   ├── scripts/
│   └── fixtures/
│
├── .github/
│   └── workflows/
├── biome.json
├── nx.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json
└── README.md
```

## 20.3 Package Boundary Rules

### Browser-only

- `overlay-ui`
- `inspector-core`
- `editor-core`
- `preview-engine`

### Node-only

- `workspace-index`
- `daemon-core`
- `storage`
- `mcp-server`
- `cli`

### Isomorphic

- `protocol`
- `change-ir`
- `geometry` 중 DOM 비의존 타입/수학
- `context-compiler`의 schema layer
- `logger` interface

### Dependency Direction

```text
UI → editor-core → change-ir/protocol
inspector-core → element-identity/geometry
preview-engine → change-ir/element-identity
extension → UI + browser packages + daemon-client

mcp-server → daemon-core → context-compiler/source-resolver/storage
integrations → source-registry/protocol
```

Node package가 browser package를 import하지 못하도록 Nx module boundary rule 또는 custom conformance check를 둔다.

## 20.4 pnpm Workspace

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "integrations/*"
  - "tools/*"

catalog:
  typescript: "<pinned-version>"
  react: "<pinned-version>"
  zod: "<pinned-version>"
```

버전은 저장소 생성 시 최신 안정 버전을 확인한 뒤 exact 또는 workspace catalog로 고정한다. floating `latest`를 committed manifest에 남기지 않는다.

## 20.5 Root Scripts

```json
{
  "scripts": {
    "dev": "nx run-many -t dev --parallel=6",
    "build": "nx run-many -t build",
    "check": "nx run-many -t check",
    "lint": "nx run-many -t lint",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "typecheck": "nx run-many -t typecheck",
    "test": "nx run-many -t test",
    "test:e2e": "nx run-many -t e2e",
    "affected": "nx affected -t check,typecheck,test,build",
    "graph": "nx graph",
    "doctor": "nx run tools-doctor:run"
  }
}
```

## 20.6 Nx Targets

공통 target:

- `dev`
- `build`
- `check`
- `lint`
- `format-check`
- `typecheck`
- `test`
- `e2e`
- `package`
- `publish`

`nx.json`의 named inputs를 분리한다.

```json
{
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/*.test.*",
      "!{projectRoot}/**/*.spec.*",
      "!{projectRoot}/test/**"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/biome.json",
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/pnpm-lock.yaml"
    ]
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "cache": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "test": {
      "inputs": ["default", "^production"],
      "cache": true
    }
  }
}
```

## 20.7 Custom Nx Generator

`tools/nx-plugin`에 generator를 만든다.

- `vision-package`
- `browser-package`
- `node-package`
- `integration-package`
- `fixture-app`

generator가 자동으로 생성해야 할 항목:

- package.json
- project.json
- tsconfig files
- src/index.ts
- Vitest config
- package boundary tag
- Biome-compatible source files
- README

Nx tag 예:

```json
{
  "tags": ["scope:editor", "platform:browser", "type:library"]
}
```

---

# 21. Biome 코드 스타일 및 품질 정책

## 21.1 원칙

- ESLint와 Prettier를 기본 toolchain에 추가하지 않는다.
- formatting, linting, import organization은 Biome로 통일한다.
- TypeScript compiler는 type checking에만 사용한다.
- package별 예외가 필요할 때만 nested `biome.json`을 사용한다.

## 21.2 Root Configuration 예시

```json
{
  "$schema": "https://biomejs.dev/schemas/<version>/schema.json",
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "**",
      "!**/dist",
      "!**/.output",
      "!**/coverage",
      "!**/.nx",
      "!**/node_modules",
      "!**/generated"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

실제 schema version과 지원 option은 초기화 시 설치된 Biome 버전에 맞춘다.

## 21.3 Import Convention

순서:

1. Node built-ins
2. external packages
3. `@vision-control/*` workspace packages
4. relative imports
5. type-only imports

public package import는 package root export를 사용한다. 다른 package의 `src/*` deep import를 금지한다.

## 21.4 Git Hooks

필수는 CI이며 local hook은 개발 편의를 위한 보조 수단이다.

pre-commit 후보:

```bash
pnpm biome check --write --staged
```

CI에서는 수정하지 않고 실패시킨다.

---

# 22. 기술 스택

| 영역 | 기술 |
|---|---|
| Monorepo | pnpm Workspaces + Nx |
| 언어 | TypeScript strict mode |
| 코드 품질 | Biome |
| Extension | WXT + React |
| Panel UI | React |
| 상태 | 작은 store + 명시적 interaction state machine |
| Schema | Zod |
| 통신 | JSON-RPC 스타일 WebSocket |
| Daemon | Node.js TypeScript |
| AST | Babel parser/traverse, 필요 시 TypeScript Compiler API |
| 코드 range 보존 | MagicString 또는 동등 도구 |
| CSS parsing | PostCSS |
| 저장 | SQLite adapter + in-memory test adapter |
| MCP | 공식 TypeScript SDK |
| 단위 테스트 | Vitest |
| 브라우저 E2E | Playwright |
| Visual diff | 보조적으로 pixel diff library |
| 로깅 | 구조화 logger interface, Node 구현은 pino 후보 |
| Drag/Resize | editor abstraction 아래 Moveable 도입 검토 |
| Marquee Select | editor abstraction 아래 Selecto 도입 검토 |

Moveable과 Selecto는 구현 가속 후보지만 핵심 Visual Intent IR과 Layout Engine이 라이브러리 이벤트 타입에 종속되어서는 안 된다.

---

# 23. Extension 설계

## 23.1 WXT Entrypoints

```text
apps/extension/entrypoints/
├── background.ts
├── content.ts
├── devtools.html
├── devtools.ts
├── panel.html
└── panel.tsx
```

역할:

- `devtools`: Vision Control panel 생성
- `panel`: DevTools UI
- `background`: tab/frame routing, daemon connection lifecycle
- `content`: inspected page runtime inspection과 overlay

## 23.2 Message Routing

```text
Panel
  ↔ DevTools Page
  ↔ Background
  ↔ Content Script
  ↔ Page Main World Bridge (필요 시)
  ↔ Local Daemon
```

각 message envelope:

```ts
interface ProtocolEnvelope<T = unknown> {
  protocolVersion: string;
  id: string;
  type: string;
  timestamp: string;
  sessionId?: string;
  tabId?: number;
  frameId?: number;
  payload: T;
}
```

## 23.3 Main World Bridge

React app의 runtime global 또는 page-owned object 접근이 필요한 경우에만 main world script를 사용한다. 기본 DOM/CSS 검사는 isolated content script에서 수행한다.

## 23.4 iframe

- same-origin iframe: frame별 content script와 좌표 변환
- cross-origin iframe: opaque region으로 표시, 내부 편집 금지
- top frame에서 selection identity에 frame ID 포함

## 23.5 Shadow DOM

- open shadow root 탐색
- closed shadow root는 내부 편집 불가
- overlay 자체는 closed 또는 강하게 격리된 shadow root

---

# 24. Local Daemon 설계

## 24.1 책임

- workspace root discovery
- browser pairing
- session lifecycle
- source registry
- AST workspace index
- context compilation
- screenshot artifact 저장
- MCP transport
- CLI API
- verification coordination
- privacy filtering

## 24.2 Pairing

- localhost interface에만 bind
- startup 시 random session token 생성
- extension에서 token 입력 또는 one-time pairing URL
- origin allowlist
- workspace별 권한

## 24.3 Daemon 내부 모듈

```text
daemon-core/
├── session-manager
├── connection-manager
├── workspace-manager
├── source-registry-service
├── changeset-service
├── context-service
├── verification-service
├── privacy-service
└── artifact-service
```

## 24.4 Storage

SQLite table 후보:

- workspaces
- browser_sessions
- page_sessions
- source_registry
- changesets
- journal_entries
- screenshots
- verification_runs
- audit_events

대형 screenshot binary는 파일 저장소에 두고 DB에는 hash/path/metadata만 저장한다.

---

# 25. Protocol 설계

## 25.1 Browser → Daemon

- `session.hello`
- `session.heartbeat`
- `page.navigated`
- `selection.changed`
- `changeset.updated`
- `source.request`
- `verification.runtimeResult`
- `diagnostic.reported`

## 25.2 Daemon → Browser

- `session.accepted`
- `workspace.bound`
- `source.resolved`
- `context.compiled`
- `verification.requested`
- `preview.clearRequested`
- `configuration.updated`

## 25.3 Versioning

- protocol version은 semver
- envelope level에서 version negotiation
- additive field는 backward compatible
- breaking schema는 major bump
- Zod schema와 generated JSON Schema를 함께 관리

---

# 26. Configuration

workspace root에 선택적으로 둔다.

```ts
interface VisionControlConfig {
  workspace: {
    include: string[];
    exclude: string[];
  };
  browser: {
    allowedOrigins: string[];
    allowNonLocalhost: boolean;
  };
  instrumentation: {
    enabled: boolean;
    attributeName: string;
    include: string[];
    exclude: string[];
  };
  styling: {
    tailwind: boolean | TailwindOptions;
    cssModules: boolean;
  };
  privacy: {
    redactSelectors: string[];
    redactAttributes: string[];
    redactTextPatterns: string[];
  };
  verification: {
    timeoutMs: number;
    screenshot: boolean;
  };
}
```

예시 파일명:

```text
vision-control.config.ts
```

---

# 27. 보안 및 개인정보 보호

## 27.1 기본 정책

- 기본 허용 origin: `localhost`, `127.0.0.1`, `[::1]`
- 외부 origin은 명시적으로 추가
- daemon은 loopback bind
- pairing token 필요
- source path는 브라우저 DOM에 노출하지 않음
- Agent context 생성 전 redaction report 제공

## 27.2 민감 요소

기본 redaction:

- `input[type=password]`
- autocomplete credential field
- `[data-private]`
- user-defined selectors
- token/API key pattern
- authorization/cookie headers

## 27.3 MCP Human-in-the-loop

- source-changing tool은 승인 필요
- tool invocation log 표시
- context에 어떤 파일/스크린샷이 포함되는지 사용자에게 표시
- clear session 기능

## 27.4 Extension Permission

초기 권한은 최소화한다. `chrome.debugger`는 기본 필수 권한으로 두지 않고 고급 진단 기능의 optional permission으로 검토한다.

---

# 28. 성능 요구사항

## 28.1 Interaction

- hover outline 목표: 60fps
- pointermove work: RAF throttling
- overlay update budget: 평균 8ms 미만
- DOM 전체 재탐색 금지
- selection 시 필요한 subtree만 분석

## 28.2 Large DOM

10,000개 이상의 DOM node 페이지에서:

- 초기 injection이 장시간 main thread를 막지 않아야 함
- lazy identity assignment
- visible candidate 우선
- tree panel virtualization

## 28.3 Source Index

- file watcher incremental update
- AST index cache
- Nx project graph를 이용한 탐색 범위 축소
- selected source project와 dependency neighborhood 우선

## 28.4 Context

- 기본 Markdown context는 사용자 설정 budget 이내
- screenshot은 필요 시에만 포함
- 중복 source snippet 제거

---

# 29. 접근성 요구사항

Vision Control 자체 UI:

- keyboard-only selection controls
- 명확한 focus ring
- ARIA labels
- tooltips
- reduced motion 대응
- high contrast overlay option
- color 외에 line style/badge로 상태 구분

편집 대상 분석:

- role/name 표시
- reparent가 label/control 관계를 깨는지 경고
- DOM order와 visual order가 달라지는 CSS `order` 사용 시 접근성 경고

---

# 30. 로깅 및 진단

## 30.1 Log Levels

- trace
- debug
- info
- warn
- error

## 30.2 Correlation

모든 interaction에 다음 ID를 연결한다.

- sessionId
- pageId
- transactionId
- operationId
- verificationRunId

## 30.3 Doctor Command

검사 항목:

- daemon port
- extension 연결
- workspace 권한
- source registry 상태
- Vite/Next plugin 활성화
- protocol version compatibility
- SQLite writable
- MCP transport

---

# 31. 테스트 전략

## 31.1 Unit Test

- Change IR schema
- operation inverse
- layout classification
- insertion index
- coordinate conversion
- source ID generation
- privacy redaction
- context compression
- verification comparison

## 31.2 Property-based Test

가능하면 다음에 적용한다.

- operation + inverse = original state
- reorder permutation consistency
- coordinate transform round-trip
- schema serialization round-trip

## 31.3 Integration Test

- extension message routing
- daemon WebSocket
- source registry updates
- MCP tool response
- SQLite repository

## 31.4 Browser E2E Fixtures

필수 fixture:

1. React + Vite + Tailwind
2. React + Vite + CSS Modules
3. Next.js + Tailwind
4. nested Flex
5. CSS Grid
6. transformed parent
7. scroll container
8. repeated list
9. Portal
10. same-origin iframe
11. Shadow DOM
12. responsive breakpoints

## 31.5 E2E Scenarios

- select element
- edit padding
- undo/redo
- reorder sibling
- reparent across containers
- resize flex item
- edit text
- export context
- simulate source patch
- HMR verification

## 31.6 Visual Regression

Overlay 자체의 visual regression을 별도 lab에서 수행한다.

- selected outline
- box model
- drop indicator
- snapping guide
- resize handles
- dark/light DevTools theme

---

# 32. CI/CD

## 32.1 Pull Request Pipeline

```text
install
→ biome check
→ nx affected typecheck
→ nx affected test
→ nx affected build
→ affected e2e smoke
→ package artifact validation
```

## 32.2 Main Branch

- full test matrix
- extension package build
- daemon binary/npm package build
- MCP package validation
- fixture compatibility

## 32.3 Release

- conventional changeset 또는 Nx release 기능 검토
- packages는 독립 version 또는 synchronized version 중 초기에는 synchronized version 권장
- extension store release는 별도 승인
- daemon/CLI는 npm 배포

---

# 33. 세부 구현 마일스톤

## Phase 0 — Repository Foundation

### 목적

pnpm + Nx + Biome 기반의 안정적인 저장소와 generator를 만든다.

### 작업

- VC-0001 Nx workspace 초기화
- VC-0002 pnpm workspace package layout 설정
- VC-0003 strict TypeScript base config
- VC-0004 Biome root config
- VC-0005 root scripts
- VC-0006 Nx named inputs/target defaults
- VC-0007 package boundary tags
- VC-0008 custom generator skeleton
- VC-0009 Vitest shared preset
- VC-0010 Playwright shared preset
- VC-0011 GitHub Actions CI
- VC-0012 changeset/release strategy
- VC-0013 ADR directory
- VC-0014 contribution guide
- VC-0015 agent instruction files

### 완료 조건

- `pnpm install`
- `pnpm check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

모두 빈 skeleton 상태에서 성공한다.

## Phase 1 — Protocol and Core Models

- VC-0101 `protocol` package
- VC-0102 message envelope
- VC-0103 protocol negotiation
- VC-0104 `change-ir` schema
- VC-0105 operation inverse model
- VC-0106 `element-identity` model
- VC-0107 geometry primitives
- VC-0108 source resolution schema
- VC-0109 verification schema
- VC-0110 JSON Schema generation
- VC-0111 compatibility tests
- VC-0112 fixture messages

### 완료 조건

모든 schema가 serialize/deserialize되고 major version mismatch가 명확히 실패한다.

## Phase 2 — Extension Skeleton

- VC-0201 WXT app 생성
- VC-0202 DevTools page
- VC-0203 Vision Control panel
- VC-0204 background service worker
- VC-0205 content script
- VC-0206 panel/background/content message bus
- VC-0207 inspected tab lifecycle
- VC-0208 same-origin frame routing
- VC-0209 local daemon connection placeholder
- VC-0210 DevTools theme detection
- VC-0211 error boundary
- VC-0212 extension packaging

### 완료 조건

패널이 열리고 현재 inspected tab URL과 기본 document summary를 표시한다.

## Phase 3 — Inspector and Overlay

- VC-0301 Shadow DOM overlay root
- VC-0302 hover hit testing
- VC-0303 selection outline
- VC-0304 selection label
- VC-0305 DOM breadcrumb
- VC-0306 parent/child keyboard navigation
- VC-0307 box model visualization
- VC-0308 computed style reader
- VC-0309 class/attribute reader
- VC-0310 scroll/resize observer
- VC-0311 transformed ancestor geometry
- VC-0312 iframe coordinate bridge
- VC-0313 overlay screenshot suppression
- VC-0314 performance benchmark fixture

### 완료 조건

대표 fixture에서 60fps에 가까운 hover와 안정적인 선택이 가능하다.

## Phase 4 — Change Journal and Property Editing

- VC-0401 journal store
- VC-0402 transaction API
- VC-0403 inverse operation
- VC-0404 undo/redo
- VC-0405 preview stylesheet manager
- VC-0406 style property editor
- VC-0407 class editor
- VC-0408 attribute editor
- VC-0409 text overlay editor
- VC-0410 change list UI
- VC-0411 clear preview
- VC-0412 session persistence
- VC-0413 conflict diagnostics

### 완료 조건

style/class/text 변경이 journal에 남고 undo/redo와 clear가 동작한다.

## Phase 5 — Figma-like Move and Reparent

- VC-0501 interaction state machine
- VC-0502 pointer capture abstraction
- VC-0503 drag threshold
- VC-0504 drag ghost
- VC-0505 candidate container resolver
- VC-0506 block/flex insertion index
- VC-0507 insertion indicator
- VC-0508 same-parent reorder preview
- VC-0509 cross-parent reparent preview
- VC-0510 structural preview reconciliation detection
- VC-0511 feasibility report
- VC-0512 HTML content model guards
- VC-0513 Portal warning
- VC-0514 repeated instance warning
- VC-0515 Alt-drag duplicate intent
- VC-0516 keyboard reorder command
- VC-0517 operation journal integration
- VC-0518 E2E drag suite

### 완료 조건

Flex와 block fixture에서 reorder/reparent가 정확한 IR로 기록된다. normal flow drag가 무조건 absolute positioning으로 변환되지 않는다.

## Phase 6 — Resize, Auto Layout, Multi-select

- VC-0601 layout classifier
- VC-0602 resize handles
- VC-0603 resize geometry
- VC-0604 semantic sizing candidates
- VC-0605 flex-basis resolver
- VC-0606 grid span resolver
- VC-0607 aspect ratio
- VC-0608 layout property panel
- VC-0609 direction/gap/padding
- VC-0610 alignment/distribution
- VC-0611 Hug/Fill/Fixed intent
- VC-0612 marquee selection
- VC-0613 multi-selection model
- VC-0614 group bounding box
- VC-0615 align selected elements
- VC-0616 equal spacing
- VC-0617 snapping engine
- VC-0618 keyboard nudging
- VC-0619 accessibility warning for visual order

### 완료 조건

Flex/Grid fixture에서 resize와 layout edit가 semantic operation으로 생성된다.

## Phase 7 — Daemon and Persistence

- VC-0701 daemon app
- VC-0702 authenticated WebSocket
- VC-0703 session manager
- VC-0704 workspace manager
- VC-0705 config loader
- VC-0706 SQLite migrations
- VC-0707 changeset repository
- VC-0708 screenshot artifact store
- VC-0709 audit log
- VC-0710 CLI skeleton
- VC-0711 doctor command
- VC-0712 extension pairing UI
- VC-0713 reconnect/backoff
- VC-0714 protocol compatibility UI

### 완료 조건

extension이 daemon에 연결되고 changeset이 저장·복원된다.

## Phase 8 — Vite React Source Mapping

- VC-0801 Vite plugin package
- VC-0802 JSX/TSX parser
- VC-0803 host element marker injection
- VC-0804 source ID generator
- VC-0805 source map preservation
- VC-0806 registry transport
- VC-0807 AST fingerprint
- VC-0808 component name inference
- VC-0809 className range capture
- VC-0810 text range capture
- VC-0811 HMR registry update
- VC-0812 marker collision test
- VC-0813 fixture source linking
- VC-0814 source open command

### 완료 조건

선택한 Vite React 요소가 올바른 workspace-relative file과 line에 연결된다.

## Phase 9 — Styling Adapters

- VC-0901 adapter contract
- VC-0902 static className adapter
- VC-0903 Tailwind token parser
- VC-0904 responsive/state variant
- VC-0905 `cn`/`clsx` AST origin
- VC-0906 CSS Modules manifest
- VC-0907 stylesheet rule origin
- VC-0908 CSS variable chain
- VC-0909 cascade diagnostics
- VC-0910 token suggestion UI
- VC-0911 deterministic edit candidate

### 완료 조건

대표 Tailwind/CSS Module 변경이 정확한 source candidate를 가진다.

## Phase 10 — Context Compiler and MCP

- VC-1001 context compiler pipeline
- VC-1002 relevant source snippet selector
- VC-1003 DOM summary compressor
- VC-1004 privacy redactor
- VC-1005 screenshot crop inclusion
- VC-1006 Markdown renderer
- VC-1007 JSON renderer
- VC-1008 MCP server
- VC-1009 read tools
- VC-1010 verification action tool
- VC-1011 invocation audit UI
- VC-1012 OpenCode config example
- VC-1013 Pi extension example
- VC-1014 generic CLI export

### 완료 조건

Agent가 MCP 또는 CLI로 현재 변경 문맥을 읽을 수 있다.

## Phase 11 — Verification Loop

- VC-1101 runtime target resolver
- VC-1102 style assertion
- VC-1103 text assertion
- VC-1104 parent/order assertion
- VC-1105 geometry tolerance
- VC-1106 accessibility assertion
- VC-1107 console policy
- VC-1108 screenshot capture
- VC-1109 screenshot diff
- VC-1110 HMR completion detector
- VC-1111 verification report UI
- VC-1112 retry context compiler

### 완료 조건

소스 patch 후 성공/부분 성공/실패를 자동 판정하고 근거를 보여준다.

## Phase 12 — Next.js and Hardening

- VC-1201 Next integration spike
- VC-1202 dev transform
- VC-1203 server/client boundary metadata
- VC-1204 App Router fixture
- VC-1205 hydration safety
- VC-1206 route navigation handling
- VC-1207 large DOM benchmark
- VC-1208 memory leak suite
- VC-1209 permission review
- VC-1210 security threat model
- VC-1211 extension store preparation
- VC-1212 documentation site

---

# 34. Boilerplating 실행 순서

Coding Agent는 아래 순서를 지켜야 한다.

## Step 1. Workspace 생성

예시 시작점:

```bash
pnpm dlx create-nx-workspace@latest vision-control \
  --preset=ts \
  --packageManager=pnpm \
  --nxCloud=skip
```

CLI option은 실행 시점의 공식 Nx CLI와 대조하고, 생성 후 package-based pnpm workspace 구조로 정리한다.

## Step 2. Root Toolchain

- package manager version pin
- TypeScript strict config
- Biome 설치 및 config
- Vitest/Playwright
- GitHub Actions
- `.nvmrc` 또는 equivalent runtime declaration

## Step 3. Core Packages 먼저 생성

순서:

1. protocol
2. change-ir
3. element-identity
4. geometry
5. logger
6. testing

UI나 extension에서 임시 중복 타입을 만들지 않는다.

## Step 4. Extension Skeleton

WXT entrypoint와 message bus만 만들고 inspector logic을 분리 package에 둔다.

## Step 5. Daemon Skeleton

extension과 daemon의 handshake를 먼저 완성한다. source mapping 전에 session/transport를 안정화한다.

## Step 6. Inspector + Journal

선택, style edit, undo/redo까지 vertical slice를 완성한다.

## Step 7. Move/Reparent

단순 transform demo가 아니라 operation IR과 inverse를 먼저 테스트한다.

## Step 8. Source Instrumentation

Vite fixture에서 source marker를 검증한다.

## Step 9. MCP and Verification

Agent read context → source patch simulation → HMR verification 전체 loop를 완성한다.

---

# 35. Agent 구현 규칙

## 35.1 작업 전

- `nx show projects`로 프로젝트 구조 확인
- `nx graph` 또는 project dependency 확인
- 관련 package README와 ADR 확인
- protocol/change schema를 먼저 확인

## 35.2 코드 작성 규칙

- `any` 사용을 피하고 불가피하면 경계에서 좁힌다.
- browser global 접근은 adapter/interface 뒤에 둔다.
- Node module은 browser bundle에 포함되지 않게 한다.
- public API는 `src/index.ts`에서 명시적으로 export한다.
- cross-package deep import 금지
- operation type 추가 시 inverse, schema, serialization, tests를 함께 추가
- protocol message 추가 시 양쪽 endpoint test 추가
- UI event를 직접 ChangeSet에 쓰지 말고 command/service를 통한다.

## 35.3 작업 완료 전 필수 명령

```bash
pnpm biome check .
pnpm nx affected -t typecheck,test,build
```

E2E 관련 변경:

```bash
pnpm nx affected -t e2e
```

## 35.4 작은 커밋 단위

- foundation
- schema
- runtime logic
- UI
- tests
- docs

대규모 기능을 한 커밋으로 섞지 않는다.

---

# 36. Acceptance Criteria

## AC-001 요소 선택

- hover된 요소에 outline이 표시된다.
- click한 요소가 panel에 나타난다.
- 스크롤 및 resize 후 outline이 따라간다.

## AC-002 스타일 편집

- property 변경이 즉시 preview된다.
- before/after가 journal에 남는다.
- undo로 원상 복구된다.

## AC-003 Reorder

- 같은 Flex container에서 drop index가 시각적으로 표시된다.
- drop 결과가 `reorder-child` operation이다.
- inverse로 원래 순서가 복구된다.

## AC-004 Reparent

- 다른 container를 drop target으로 선택할 수 있다.
- source/target parent identity와 index가 기록된다.
- invalid HTML 구조는 차단된다.

## AC-005 Resize

- drag 중 부드러운 preview가 보인다.
- pointerup 후 layout-specific candidate가 생성된다.
- flex item은 가능한 경우 단순 transform이 아닌 sizing intent를 갖는다.

## AC-006 Source Mapping

- instrumented fixture의 요소가 올바른 file/line에 연결된다.
- 동일 source에서 반복된 instance는 runtime ID로 구분된다.

## AC-007 MCP Context

- Agent가 현재 ChangeSet을 schema-valid response로 조회한다.
- source snippet과 verification plan이 포함된다.
- redacted data가 표시된다.

## AC-008 Verification

- HMR 후 target을 재식별한다.
- property/text/parent/order assertions가 실행된다.
- 실패 근거가 UI와 MCP response에 나타난다.

---

# 37. Definition of Done

기능은 다음을 모두 만족해야 완료다.

- 요구사항에 대응하는 issue/task ID 존재
- typed public API
- unit test
- 필요한 integration/E2E test
- Biome check 통과
- typecheck 통과
- package boundary 위반 없음
- docs 또는 README 업데이트
- log/error handling
- privacy 영향 검토
- undo/rollback 가능성 검토
- protocol/schema 변경 시 version 영향 기록

---

# 38. 주요 위험과 대응

## R1. DOM 이동과 React reconciliation 충돌

대응:

- structural preview와 source intent 분리
- simulated ghost fallback
- HMR 후 실제 결과 검증

## R2. 잘못된 source mapping

대응:

- build-time marker 우선
- confidence 표시
- 여러 candidate 제공
- source fingerprint

## R3. Drag 결과가 반응형을 파괴

대응:

- layout classification
- transform preview와 semantic commit 분리
- breakpoint context
- fixed pixel 자동 확정 금지

## R4. Extension permission 불신

대응:

- localhost 기본
- optional debugger permission
- redaction UI
- audit log

## R5. 복잡한 동적 JSX

대응:

- deterministic patch를 강요하지 않음
- Agent-required 표시
- source 주변 문맥 제공

## R6. 라이브러리 종속

대응:

- Moveable/Selecto를 adapter 아래 사용
- IR과 core geometry는 자체 package

## R7. 대형 monorepo 성능

대응:

- Nx graph로 탐색 범위 제한
- incremental AST index
- affected tasks와 cache

---

# 39. Architecture Decision Records

초기에 작성할 ADR:

- ADR-001 pnpm Workspaces + Nx
- ADR-002 Biome only lint/format
- ADR-003 WXT extension framework
- ADR-004 Node.js daemon
- ADR-005 Visual Intent IR separates preview mutation
- ADR-006 build-time source marker
- ADR-007 MCP + CLI dual integration
- ADR-008 SQLite persistence
- ADR-009 Moveable/Selecto behind adapter
- ADR-010 no mandatory chrome.debugger permission

---

# 40. Open Questions

1. source marker를 모든 host JSX에 넣을지 선택 모드 활성화 시 필요한 file만 계측할지
2. Next.js transform을 SWC plugin, Babel path, wrapper compiler 중 무엇으로 구현할지
3. multi-selection의 cross-container group move를 어디까지 허용할지
4. direct codemod를 V1에 포함할지
5. Tailwind config와 generated CSS 중 어느 쪽을 token source of truth로 볼지
6. screenshot 저장 기본 보존 기간
7. MCP HTTP transport를 초기부터 제공할지 stdio만 제공할지
8. visual editor core에 Moveable을 채택할지 자체 pointer engine을 유지할지
9. CSS Grid reorder에서 DOM order와 grid-area 변경의 기본 우선순위
10. production-like staging origin을 허용할 때 보안 UX

---

# 41. 제품 성공 지표

초기 내부 지표:

- 선택 요소 source mapping 성공률
- high-confidence mapping 비율
- visual operation → usable Agent patch 성공률
- 첫 시도 verification pass 비율
- 평균 context 크기
- drag/reparent preview rollback 오류율
- extension crash-free session
- source patch까지 걸린 사용자 interaction 수

정성 지표:

- 개발자가 브라우저 실험을 다시 설명할 필요가 줄었는가
- Agent가 엉뚱한 컴포넌트를 수정하는 빈도가 줄었는가
- 반응형 레이아웃 파손이 줄었는가
- 디자인 변경 검증이 빨라졌는가

---

# 42. 초기 Demo Definition

첫 공개 가능한 demo는 다음 시나리오를 끝까지 보여야 한다.

1. Vite React Tailwind fixture 실행
2. Vision Control extension 연결
3. 카드 선택
4. 카드 padding과 색상 변경
5. 카드 목록에서 순서 변경
6. Sidebar의 버튼을 Header로 reparent
7. 카드 width resize
8. ChangeSet 확인
9. MCP로 Agent가 context 조회
10. Agent 또는 fixture script가 source 수정
11. HMR
12. Vision Control verification 성공

이 demo가 완성되기 전까지 부가 기능을 우선하지 않는다.

---

# 43. 참고한 공식 문서

문서 작성 시점에 다음 공식 자료의 현재 구조를 참고했다.

1. Nx — Adding Nx to NPM/Yarn/PNPM Workspace  
   https://nx.dev/docs/guides/adopting-nx/adding-to-monorepo

2. Nx — Crafting Your Workspace  
   https://nx.dev/docs/getting-started/tutorials/crafting-your-workspace

3. Nx — create-nx-workspace reference  
   https://nx.dev/docs/reference/create-nx-workspace

4. Biome — Use Biome in big projects  
   https://biomejs.dev/guides/big-projects/

5. Biome — Organize Imports  
   https://biomejs.dev/assist/actions/organize-imports/

6. WXT — Entrypoints  
   https://wxt.dev/guide/essentials/entrypoints

7. Chrome Extensions — DevTools Panels API  
   https://developer.chrome.com/docs/extensions/reference/api/devtools/panels

8. Chrome Extensions — inspectedWindow API  
   https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow

9. Chrome Extensions — debugger API  
   https://developer.chrome.com/docs/extensions/reference/api/debugger

10. Model Context Protocol — Tools  
    https://modelcontextprotocol.io/specification/2025-11-25/server/tools

11. Babel Parser and Traverse  
    https://babel.dev/docs/babel-parser  
    https://babel.dev/docs/babel-traverse

12. Moveable documentation  
    https://daybrush.com/moveable/release/latest/doc/

13. Selecto documentation  
    https://daybrush.com/selecto/release/latest/doc/

---

# Appendix A. 권장 초기 Package Public APIs

## `@vision-control/change-ir`

```ts
export type {
  ChangeSet,
  JournalEntry,
  VisualOperation,
  ReorderChildOperation,
  ReparentElementOperation,
  ResizeElementOperation,
};

export {
  changeSetSchema,
  visualOperationSchema,
  invertOperation,
  mergeOperations,
};
```

## `@vision-control/editor-core`

```ts
export interface EditorController {
  setMode(mode: EditorMode): void;
  select(target: ElementRef): void;
  beginInteraction(input: InteractionInput): void;
  updateInteraction(input: InteractionInput): void;
  commitInteraction(): Promise<VisualOperation[]>;
  cancelInteraction(): void;
}
```

## `@vision-control/layout-engine`

```ts
export interface LayoutEngine {
  classify(element: Element): LayoutAnalysis;
  resolveDropIntent(input: DropIntentInput): DropIntentCandidate[];
  resolveResizeIntent(input: ResizeIntentInput): ResizeIntentCandidate[];
}
```

## `@vision-control/source-resolver`

```ts
export interface SourceResolver {
  resolveElement(target: ElementRef): Promise<SourceResolution>;
  resolveOperation(operation: VisualOperation): Promise<SourceEditCandidate[]>;
}
```

---

# Appendix B. Error Taxonomy

```ts
type VisionControlErrorCode =
  | "PROTOCOL_VERSION_MISMATCH"
  | "DAEMON_UNREACHABLE"
  | "WORKSPACE_NOT_BOUND"
  | "SOURCE_NOT_RESOLVED"
  | "SOURCE_AMBIGUOUS"
  | "INVALID_DROP_TARGET"
  | "STRUCTURAL_PREVIEW_RECONCILED"
  | "CROSS_ORIGIN_FRAME"
  | "UNSUPPORTED_LAYOUT"
  | "PREVIEW_CONFLICT"
  | "PRIVACY_REDACTION_REQUIRED"
  | "VERIFICATION_TARGET_NOT_FOUND"
  | "VERIFICATION_ASSERTION_FAILED";
```

사용자 메시지, developer detail, retryability를 분리한다.

---

# Appendix C. Suggested Repository README Quick Start

```bash
corepack enable
pnpm install
pnpm nx run daemon:dev
pnpm nx run extension:dev
pnpm nx run playground-react-vite:dev
```

검사:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:e2e
```

---

# Appendix D. 구현 시 절대 지켜야 할 핵심 제약

1. runtime preview mutation을 source change와 동일시하지 않는다.
2. normal-flow drag를 자동으로 absolute positioning으로 바꾸지 않는다.
3. source confidence가 낮을 때 단일 파일을 확정적으로 지목하지 않는다.
4. 반복 렌더링 instance와 JSX source를 구분한다.
5. 모든 structural operation은 inverse를 가져야 한다.
6. 민감한 DOM/네트워크 데이터를 기본 context에 포함하지 않는다.
7. core IR은 Moveable, Selecto, React, WXT 이벤트 타입에 의존하지 않는다.
8. browser-only와 Node-only package boundary를 깨지 않는다.
9. Biome 외 formatter/linter를 중복 도입하지 않는다.
10. Agent가 source를 바꾼 뒤 반드시 runtime verification loop를 제공한다.
