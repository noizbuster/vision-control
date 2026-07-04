# Vision Control

[![Build](https://img.shields.io/badge/build-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](#)

> 한국어 문서입니다. English: [README.md](./README.md).

Vision Control은 Chromium DevTools 패널과 로컬 daemon을 결합하여, live 웹
페이지의 시각적 편집을 구조화된 소스 변경 의도로 바꾸는 도구다. 페이지에서
요소를 선택하고, 검사하고, 편집 명령을 내린다. 런타임은 그 편집을 브라우저에서
미리보기로 보여준다. 읽기 전용 MCP 서버는 코딩 agent가 페이지를 이해하고 자신의
작업을 검증하는 데 필요한 컨텍스트를 전달한다. 단, 소스를 몰래 다시 쓰는 일은
절대 없다.

런타임 미리보기는 소스 변경이 아니다. 이 분리가 프로젝트의 핵심 보증이다. 시각적
편집은 agent나 사람이 실제 패치를 적용하기 전까지 언제든 되돌릴 수 있다.

전체 제품 범위와 아키텍처: [Vision-Control-PRD.md](./Vision-Control-PRD.md).

---

## 작동 방식

```
[ DevTools panel ]        pick + edit (style, layout, text, props)
        |  change IR + reversible preview
        v
[ daemon (loopback) ]     session, source registry, context compiler
        |  read-only context
        v
[ MCP server + CLI ]      coding agent reads context, patches source
        |  HMR
        v
[ verification engine ]   re-identifies the target after HMR, asserts the real DOM
```

파이프라인을 세 단계로 요약한다.

1. **Vision Control** DevTools 패널에서 시각적으로 편집한다. 각 편집은 계산된
   역연산을 가진 change-IR 연산으로 변환되고, 되돌릴 수 있는 미리보기로 적용된다.
2. agent는 MCP 서버나 CLI를 통해 컨텍스트(현재 선택, changeset, 소스 해석,
   breakpoint, 토큰 레지스트리)를 읽은 뒤, 소스를 직접 패치한다.
3. 검증 엔진은 HMR 이후 대상을 다시 식별하고, 실제 post-HMR DOM에 대해
   어서션을 실행한다. "미리보기가 그럴듯해 보인다"는 증거로 인정되지 않는다.

---

## 퀵 스타트 (도구 사용하기)

요구 사항: Node 22 이상, pnpm 11.9.0 (Corepack으로 관리).

### 1. 설치하고 빌드하기

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm nx run extension:build    # -> apps/extension/.output/chrome-mv3/
pnpm nx run cli:build          # -> packages/cli/dist/bin.js  (the `vision-control` CLI)
pnpm nx run mcp-server:build   # -> packages/mcp-server/dist/bin.js  (MCP stdio server)
pnpm nx run daemon:build       # -> apps/daemon/dist/  (loopback daemon)
```

### 2. daemon 시작하기

```bash
vision-control daemon          # via the CLI (recommended)
# or, during development:
pnpm nx run daemon:dev
```

성공적으로 시작하면 daemon은 stdout에 JSON 한 줄을 출력한다.

```
{"event":"ready","port":4321,"host":"127.0.0.1","pairingUrl":"vision-control://pair?token=...","sessionId":"..."}
```

페어링 토큰은 정확히 한 번만 표시된다. SHA-256 해시만 저장된다. daemon은
loopback 주소(`127.0.0.1`, `::1`, `localhost`)에만 바인딩된다. loopback이 아닌
호스트는 listen 이전에 거부된다. `--host` / `--port` / `--workspace` / `--db`
플래그와 선택적 `vision-control.config.ts`는
[apps/daemon/README.md](./apps/daemon/README.md)를 참고한다.

### 3. Chromium에 확장 프로그램 불러오기

1. `chrome://extensions`를 연다.
2. **Developer mode**를 켠다.
3. **Load unpacked**를 클릭하고 `apps/extension/.output/chrome-mv3/`를 선택한다.
4. loopback 페이지(`http://localhost:*` / `http://127.0.0.1:*`)에서 DevTools를
   연다. **Vision Control** 패널이 나타난다.

빌드된 매니페스트는 의도적으로 좁게 범위가 잡혀 있다. `host_permissions`는
loopback 전용이고, `debugger`는 `optional_permissions` 항목이라 절대 필수가
아니다. 권한 근거는 [apps/extension/README.md](./apps/extension/README.md)를
본다.

### 4. 페어링

일회용 페어링 토큰을 입력하거나, daemon이 출력한
`vision-control://pair?token=...` URL을 연다. 패널의 연결 상태가 connected로
바뀌고, 작업 공간에 바인딩된다.

### 5. 편집

- **선택하고 검사하기**: hover로 강조하고, click으로 선택한다. 인스펙터는
  breadcrumb, 계산된 스타일, 박스 모델, 클래스, 속성, 시맨틱을 보여준다.
- **편집**: 패널 에디터로 스타일, 클래스, 텍스트, 속성을 변경한다.
- **다중 선택**: Shift를 누른 채 click으로 그룹의 요소를 토글하거나, 사각형
  marquee를 끌어 박스 선택한다. (marquee와 Shift+Click은 실제 브라우저 e2e로
  검증된다.)
- **이동과 리사이즈**: 같은 부모 안에서 순서를 바꾸고 (Flex/block), 부모를
  넘겨 reparent하고 (normal-flow 드래그가 absolute로 무너지지 않도록 보호됨),
  의미 단위로 리사이즈한다 (flex-basis, grid-span, align-self 후보).
- **V1 패널** (다중 선택 그룹이 있을 때 렌더링됨): **Auto Layout**
  (Hug / Fill / Fixed, 방향, 간격, 패딩, 정렬), **CSS Grid** 재정렬과
  grid-span, 그리고 **정렬·분배** (10개 명령).
- **컴포넌트 props**: daemon이 찾아낸 props를 편집한다. 경계를 넘는 편집은
  옵트인하지 않으면 차단된다.
- **가상 요소**: `::before` / `::after`를 편집하고, 미리보기 시점에서
  `:hover`, `:focus`, `:active`, `:disabled`도 다룬다.

### 6. 실행 취소, 다시 실행, 미리보기 지우기

실행 취소와 다시 실행은 무손실이다 (모든 change-IR 연산이 계산된 역연산을 갖는다).
패널 액션이나 CLI로 전체 미리보기를 지울 수 있다.

```bash
vision-control preview clear
```

### 7. agent용 컨텍스트 내보내기

현재 선택에 대해 컴파일되고 민감 정보가 마스킹된 컨텍스트를, agent가 선호하는
형식으로 가져온다.

```bash
vision-control context current                # JSON (default)
vision-control context current --format markdown
```

Markdown 내보내기에는 breakpoint와 토큰 레지스트리 섹션, 프라이버시 리포트,
토큰 예산 잘림이 추가로 포함된다. agent는 MCP를 통해 같은 컨텍스트를 실시간으로
가져올 수도 있다 (다음 섹션 참고).

### 8. agent가 소스를 패치하고, 검증하기

agent가 소스를 직접 패치한다 (Vision Control이 대신 소스를 쓰지 않는다). HMR
이후, 실제 post-HMR DOM에 대해 패치를 검증한다.

```bash
vision-control verify current
```

엔진은 먼저 미리보기를 지우고, source-id 캐스케이드로 대상을 다시 식별한 뒤,
미리보기 레이어가 아닌 실제 DOM에 어서션을 실행한다. 이것이 "미리보기가
그럴듯했다"와 "소스가 실제로 바뀌었다"를 구분하는 지점이다.

codemod 경로가 필요하다면, CLI가 결정론적 제안을 로컬에서 미리보기하고 적용할 수
있다 (절대 MCP 도구가 아니다).

```bash
vision-control codemod preview <suggestion-id>
vision-control codemod apply <suggestion-id> --confirm
```

### 프레임워크 설정 (소스 마커를 해석하려면)

소스 해석에는 불투명 `data-vc-source` 마커가 필요하다. 이 마커는 dev 전용이며
프로덕션 빌드에는 절대 들어가지 않는다.

- **Vite + React**: dev에서 Vite React 플러그인으로 앱을 실행한다.
- **Next.js**: 설정을 `withVisionControlSourceMarkers`로 감싼다. webpack
  (`next dev` / `next build`)과 Turbopack (`next dev --turbo` / `next build --turbo`,
  Next 15+) 양쪽 번들러 경로로 마커가 주입된다. `NODE_ENV=production`에서는 이
  래퍼가 완전히 no-op다. 자세한 내용은
  [integrations/next-react/README.md](./integrations/next-react/README.md).
- **Tailwind**: v3 설정과 v4 CSS 우선 `@theme` 토큰은 daemon이 자동으로 찾는다
  (수동 연결 불필요). [integrations/tailwind/README.md](./integrations/tailwind/README.md).
- **CSS Modules**: 매핑이 자동이다 (매니페스트와 소스맵 활용). Vue와 Svelte
  어댑터는 템플릿/마크업의 클래스 출처를 해석한다. Vanilla CSS 클래스 토큰은
  AST 출처를 기준으로 HIGH 신뢰도로 해석된다.

---

## 코딩 agent와 함께 쓰기

MCP 서버는 읽기 전용이다. stdio와 loopback HTTP로 11개 도구를 노출한다. 읽기 7개와
조정 시그널 4개다. 소스를 변경하는 도구는 없으며, 앞으로도 만들지 않는다. agent는
자체 파일 쓰기 매커니즘으로 패치를 적용하고, 검증이 그 결과를 증명한다.

서버는 한 번 빌드한다.

```bash
pnpm nx run mcp-server:build
```

CLI와 HTTP transport가 사용하는 환경 변수:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VC_DAEMON_URL` | `http://127.0.0.1:4321` | Daemon base URL (`status`, `doctor`가 사용). |
| `VC_MCP_URL` | _(unset)_ | MCP HTTP endpoint, 예: `http://127.0.0.1:4322/mcp`. 데이터 명령에 필수. |
| `VC_MCP_TOKEN` | _(unset)_ | MCP 세션 토큰 (`Authorization: Bearer <token>`). |

OpenCode, Claude Code, 일반 stdio + HTTP 설정에 그대로 붙여넣을 수 있는 스니펫은
[docs/mcp-config-examples.md](./docs/mcp-config-examples.md)에 있다.

11개 도구:

**읽기 전용 (7)**

- `vision_get_active_session`
- `vision_get_selection`
- `vision_get_changeset`
- `vision_get_source_context`
- `vision_get_verification_plan`
- `vision_get_diagnostics`
- `vision_capture_element`

**조정 시그널 (4)**

- `vision_request_verification`
- `vision_clear_preview`
- `vision_mark_patch_started`
- `vision_mark_patch_completed`

모든 응답은 서버를 떠나기 전에 `@vision-control/security#redactObject`로
마스킹된다. 읽기 전용 정책과 "소스 쓰기 도구는 절대 내놓지 않는다"는 근거는
[docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md)에 있다.

연결을 종단 간 확인한다.

```bash
VC_MCP_URL=http://127.0.0.1:4322/mcp VC_MCP_TOKEN=change-me \
  vision-control doctor
```

### CLI 명령 참조

```
vision-control <command> [subcommand] [options]
```

| Command | Description |
| --- | --- |
| `daemon` | Vision Control daemon을 시작한다. |
| `status` | daemon에 닿는지 표시한다. |
| `sessions list` | 활성 daemon 세션을 나열한다. |
| `context current [--format json\|markdown]` | 현재 선택에 대한 컴파일된 agent 컨텍스트. 기본은 JSON. |
| `changes current` | 현재 changeset을 표시한다. |
| `verify current` | 현재 changeset의 검증을 요청한다. |
| `preview clear` | 모든 런타임 미리보기 mutation을 지운다. |
| `share export --out <path> [--include-screenshots]` | 마스킹되고 서명된 세션 번들을 내보낸다 (로컬 전용). |
| `share import <path>` | 로컬 세션 번들을 가져와 검증한다. |
| `codemod preview <suggestion-id>` | 결정론적 패치 제안을 미리 본다. |
| `codemod apply <suggestion-id> --confirm` | 제안을 적용한다 (로컬 agent 액션, 절대 MCP 도구가 아님). |
| `doctor` | 작업 공간과 런타임 상태를 점검한다. |
| `help`, `--help`, `-h` | 도움말을 출력한다. |

---

## 기능

v0.2.0에서 동작하는 기능의 하이라이트. 기능별 상태와 소스 경로가 담긴 권위 있는
목록은 [docs/feature-matrix.md](./docs/feature-matrix.md)에 있다.

**편집 표면**

- Shadow-DOM 오버레이, 요소 피커, 인스펙터 (breadcrumb, 계산된 스타일, 박스
  모델, 클래스, 속성, 시맨틱).
- 스타일, 클래스, 텍스트, 속성 에디터. 미리보기 시점을 통한 가상 요소 편집
  (`::before` / `::after`)과 상태 가상 클래스 (`:hover`, `:focus`, `:active`,
  `:disabled`).
- Shift+Click과 marquee로 다중 선택. 그룹 이동 (재정렬, reparent)과 의미 단위
  리사이즈.
- Auto Layout 패널 (Hug / Fill / Fixed, 방향, 간격, 패딩, 정렬).
- CSS Grid 재정렬과 grid-span. 정렬·분배 (10개 명령).
- 컴포넌트 props 편집 (daemon이 제공하는 discovery). Breakpoint와 viewport
  컨텍스트.

**소스 해석**

- Vite + React와 Next.js (webpack, Turbopack)를 통한 dev 전용 불투명
  `data-vc-source` 마커. 프로덕션 빌드에는 마커가 하나도 들어가지 않는다.
- Tailwind v3 설정과 v4 `@theme` 토큰 인식 편집. CSS Modules 매핑. Vue,
  Svelte, CSS-in-JS, vanilla CSS 어댑터.
- Never-wrong-HIGH 정책: 레지스트리 전용 후보는 HIGH 신뢰도에 도달하지 않는다.

**컨텍스트, 검증, 서비스**

- 마스킹된 JSON과 Markdown 컨텍스트 내보내기. breakpoint와 토큰 레지스트리
  섹션, 프라이버시 리포트, 토큰 예산 잘림 포함.
- HMR 검증 엔진. HMR 이후 대상을 다시 식별하고, 실제 post-HMR DOM에 대해
  어서션을 실행한다.
- 인증된 loopback daemon. SQLite 저장, 일회용 페어링 토큰, append-only 감사 로그.
- 읽기 전용 MCP 서버: stdio와 loopback HTTP로 11개 도구.

---

## 제약

Vision Control은 로컬 개발 도구다. 어떤 패키지도 레지스트리에 퍼블리시되지
않았고, 확장 프로그램은 브라우저 스토어에 올라와 있지 않다. 아래 경계는
명시적이며, 숨겨진 사항이 아니다. 자세한 내용은
[docs/known-limitations.md](./docs/known-limitations.md).

- **미리보기는 소스 변경이 아니다.** 런타임 편집은 agent나 사람이 실제 패치를
  적용하고 post-HMR DOM에 대해 검증이 통과할 때만 현실이 된다.
- **Firefox는 매니페스트 수준만 지원된다.** 호환 매트릭스는 빌드와 매니페스트의
  보안 태세를 검증한다. 브라우저 구동 Firefox 검사는 stub 처리되어 있고,
  Chromium (MV3) 빌드가 주 타깃이다 (ADR-016).
- **패널에 묶인 V1 기능은 브라우저 구동 e2e가 없다.** 그룹 이동, CSS Grid
  재정렬과 span, 정렬·분배, Auto Layout은 콘텐츠 런타임에 연결되어 있고 종단 간
  유닛 테스트를 거쳤지만, 사용자에게 보이는 흐름은 DevTools 패널에 있으며
  현재 Playwright harness로는 구동할 수 없다. 콘텐츠 기능 (선택, Shift+Click 다중
  선택, marquee)은 실제 브라우저 e2e가 있다. 이것은 구현 격차가 아니라 검증
  후속 작업이다.
- **원격 협업은 없다.** 로컬 공유 번들만 제공된다 (ADR-015). 원격 실시간 협업은
  트러스트 모델 ADR (ADR-018) 뒤로 미뤄졌다.
- **접근성 수리는 권고만 한다.** 시스템은 문제와 제안된 수정을 보고한다. 단,
  DOM이나 소스를 자동으로 바꾸지는 않는다 (ADR-017).

---

## 기여자와 개발자를 위해

작업 완료를 선언하려면 아래 게이트가 모두 통과해야 한다. 실제 명령 출력을
요약이 아닌 그대로 `.omo/evidence/task-<N>-*.md`에 남긴다.

```bash
pnpm check          # Biome lint + format check (Biome is the only formatter)
pnpm typecheck      # tsc --noEmit across all packages
pnpm test           # vitest run across all packages
pnpm build          # tsc -p tsconfig.build.json across all packages
pnpm boundaries     # package boundary checker
pnpm test:e2e       # Playwright e2e (if your change touches e2e)
```

작업 공간을 살핀다.

```bash
pnpm nx show projects   # list all 40 packages
pnpm graph              # open the Nx project dependency graph
pnpm doctor             # print the Nx environment report
vision-control doctor   # nine workspace + runtime health checks
```

### 모노레포 구조

```
vision-control/
├── apps/
│   ├── extension/            Chromium extension (WXT + React)
│   ├── daemon/               Authenticated loopback daemon
│   ├── playground-react-vite/  Fixture app for development
│   └── visual-regression-lab/   Screenshot diff harness
├── packages/
│   ├── protocol/             Shared message and schema definitions
│   ├── change-ir/            Core change representation
│   ├── element-identity/     Stable element addressing
│   ├── geometry/             DOM-independent geometry math
│   ├── inspector-core/       Read-side inspection logic
│   ├── overlay-ui/           Selection overlay (browser only)
│   ├── editor-core/          Edit command logic
│   ├── interaction-machine/  Intent state machine
│   ├── layout-engine/        Layout analysis
│   ├── preview-engine/       Runtime preview renderer (browser only)
│   ├── change-journal/       Undo/redo journal
│   ├── source-registry/      Source marker registry
│   ├── source-resolver/      Element to source resolution
│   ├── workspace-index/      File index (node only)
│   ├── context-compiler/     Context export assembly
│   ├── verification-engine/  HMR assertion engine
│   ├── daemon-client/        Browser to daemon transport
│   ├── daemon-core/          Daemon request handling (node only)
│   ├── storage/              Persistence layer (node only)
│   ├── security/             Auth and redaction
│   ├── mcp-server/           Read-only MCP server (node only)
│   ├── cli/                  Command-line entry point (node only)
│   ├── logger/               Structured logging interface
│   ├── testing/              Shared test utilities
│   └── shared-ui/            Shared React components
├── integrations/
│   ├── vite-react/           Vite + React source marker plugin
│   ├── next-react/           Next.js integration (V1)
│   ├── tailwind/             Tailwind integration (V1)
│   ├── css-modules/          CSS Modules mapping (V1)
│   ├── vanilla-css/          Plain CSS support
│   ├── opencode/             OpenCode adapter example
│   └── pi/                   Pi adapter example
├── tools/
│   └── nx-plugin/            Package generator + boundary checker
├── docs/
│   ├── adr/                  Architecture Decision Records
│   └── agents/               Agent instruction guides
├── Vision-Control-PRD.md     Product requirements and architecture
├── CONTRIBUTING.md           Development setup and conventions
└── AGENTS.md                 Brief for AI coding agents
```

권위 있는 디렉터리 트리는 [PRD section 20.2](./Vision-Control-PRD.md)에, 패키지
경계 규칙은 [PRD section 20.3](./Vision-Control-PRD.md)에 있다. `pnpm boundaries`가
두 규칙을 강제한다. 첫째, `platform:node` 패키지는 `platform:browser` 패키지를
import하면 안 된다. 둘째, 어떤 패키지도 다른 패키지의 `src/`를 deep-import하면 안
된다. 전체 규칙과 예시: [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md).

### 아키텍처 결정

주요 결정은 모두 [docs/adr/](./docs/adr/) 아래 Architecture Decision Record로
기록되어 있다. 툴체인 근거는 [ADR-001](./docs/adr/ADR-001-toolchain.md)부터
읽으면서 순서대로 본다. 각 ADR에는 guardrail 섹션이 있어, 그 결정이 무엇을
보호하고 어떤 기능을 의도적으로 제외하는지 설명한다.

### 기여하기

개발 환경 설정, 커밋 관례, 패키지 생성기, PR 체크리스트는
[CONTRIBUTING.md](./CONTRIBUTING.md)를 읽는다.

이 저장소에서 작업하는 AI 코딩 agent라면 먼저 [AGENTS.md](./AGENTS.md)를
읽는다. 소스를 변경하는 MCP 도구 금지, 프로덕션 소스 마커 금지, v0.2.0 범위
경계 같은 강한 가드레일을 다룬다.

---

## 트러블슈팅과 문서

- 설치, 빌드, 연결 문제:
  [docs/troubleshooting.md](./docs/troubleshooting.md).
- 보안과 프라이버시 태세:
  [docs/security-privacy-overview.md](./docs/security-privacy-overview.md).
- OpenCode, Claude Code, 일반 stdio + HTTP용 MCP 서버 설정:
  [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).
- 소스 경로가 포함된 기능 상태: [docs/feature-matrix.md](./docs/feature-matrix.md).
- 범위 경계: [docs/known-limitations.md](./docs/known-limitations.md).
- 생성된 프로토콜 JSON Schema:
  [docs/json-schemas/protocol-envelope.json](./docs/json-schemas/protocol-envelope.json).
- 아키텍처 결정: [docs/adr/](./docs/adr/). agent 대상 엔지니어링 계약:
  [docs/agents/](./docs/agents/).
- 릴리스 노트: [v0.2.0](./docs/release-notes-v0.2.0.md),
  [v0.1.0](./docs/release-notes-v0.1.0.md). v0.1.0에서 업그레이드:
  [docs/migration-v0.1.0-to-v0.2.0.md](./docs/migration-v0.1.0-to-v0.2.0.md).
