# Vision Control

[![Build](https://img.shields.io/badge/build-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](#)

> 한국어 문서입니다. English: [README.md](./README.md).

Vision Control은 live 웹 페이지의 시각적 편집을 구조화된 소스 변경 의도로
바꾼다. Chromium DevTools 패널에서 요소를 선택하고, 검사하고, 편집 명령을
내린다. 런타임은 그 편집을 브라우저에서 미리보기로 보여준다. **확장 프로그램이
선택·미리보기·탭 저널의 소스 오브 트루스(SoT)** 다. **선택적** 단일 프로세스
MCP 브리지는 코딩 agent에게 그 상태의 투영을 넘겨, 페이지를 이해하고 작업을
검증하게 한다. 소스를 몰래 다시 쓰는 일은 없다.

런타임 미리보기는 소스 변경이 아니다. 시각적 편집은 agent나 사람이 실제 패치를
적용하기 전까지 언제든 되돌릴 수 있다.

아키텍처 계약: [ADR-019](./docs/adr/ADR-019-extension-source-of-truth.md)
(확장 SoT), [ADR-020](./docs/adr/ADR-020-mcp-bridge-projection.md) (MCP 브리지).
전체 제품 범위 이력: [Vision-Control-PRD.md](./Vision-Control-PRD.md).

---

## 작동 방식

```
[ DevTools panel ]        pick + edit (style, layout, text)
        |  change IR + reversible preview + tab journal
        v
[ extension (SoT) ]       selection, preview, journal, map origins, verify
        |  optional pair (loopback :4322)
        v
[ MCP bridge ]            projection cache + coordination signals for an agent
        |  agent patches source with its own file tools
        v
[ content verify ]        clear preview, re-identify target, assert real DOM
```

1. **Vision Control** DevTools 패널에서 시각적으로 편집한다. 각 편집은 계산된
   역연산을 가진 change-IR 연산으로 변환되고, 되돌릴 수 있는 미리보기로 적용된다.
   Undo/redo와 패널 컨텍스트 export는 Node 프로세스 없이 동작한다.
2. 선택적으로 `vision-control mcp`를 시작하고 확장을 페어한다. agent는 9개의
   읽기 전용 MCP 도구로 선택·changeset·컨텍스트 투영을 읽은 뒤, 소스를 직접
   패치한다.
3. 검증은 미리보기를 지운 뒤 content script가 실제 post-HMR DOM에 대해 실행한다.
   "미리보기가 그럴듯해 보인다"는 증거로 인정되지 않는다.

---

## 퀵 스타트 (확장 우선)

요구 사항: Node 22 이상, pnpm 11.9.0 (Corepack으로 관리).

**daemon을 먼저 시작하지 않는다.** 일반 편집은 확장만으로 충분하다.

### 1. 설치하고 확장 빌드하기

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm nx run extension:build    # -> apps/extension/.output/chrome-mv3/
```

### 2. Chromium에 확장 프로그램 불러오기

1. `chrome://extensions`를 연다.
2. **Developer mode**를 켠다.
3. **Load unpacked**를 클릭하고 `apps/extension/.output/chrome-mv3/`를 선택한다.
4. loopback 페이지(`http://localhost:*` / `http://127.0.0.1:*`)에서 DevTools를
   연다. **Vision Control** 패널이 나타난다.

빌드된 매니페스트는 의도적으로 좁다. `host_permissions`는 loopback 전용이고,
`debugger`는 `optional_permissions`라 필수가 아니다. 권한 근거:
[apps/extension/README.md](./apps/extension/README.md).

### loopback이 아닌 호스트 검사하기 (Site access)

loopback이 기본값이다. 다른 로컬 개발 호스트(예: `http://subshell:10601/`)는
패널의 **Site Access**에서 호스트를 입력하고 **Allow**한 뒤 Chrome 권한 프롬프트를
승인한다. 와일드카드 자동 허용은 없다. 본인이 통제하는 호스트만 허용한다.

### 3. 오프라인 편집

MCP 프로세스 없이 편집 루프가 동작한다.

- **선택·검사**: hover로 하이라이트, click으로 선택.
- **편집**: 스타일, 클래스, 텍스트, 속성 편집기.
- **멀티 선택**: Shift+Click, marquee.
- **이동·리사이즈**: 같은 부모 재정렬, 가드된 reparent, 시맨틱 resize.
- **V1 패널**: Auto Layout, CSS Grid, alignment/distribution.
- **Undo / redo / clear preview**: 패널에서 수행.
- **컨텍스트 export**: 패널 export로 편집된 스냅샷을 agent에 넘긴다. origins는
  비어 있을 수 있다.

### 4. 선택: 코딩 agent 연결 (MCP 브리지)

```bash
pnpm nx run mcp-server:build
pnpm nx run cli:build

vision-control mcp
```

한 프로세스가 다음을 제공한다.

1. agent용 **stdio** MCP (stdout은 JSON-RPC 전용)
2. **`GET http://127.0.0.1:4322/discover`** (시크릿 없는 자동 탐지)
3. **`ws://127.0.0.1:4322/bridge`** (확장 페어 + 스냅샷 브리지)

포트 **4322**는 고정이다. 사용 중이면 명확한 오류로 실패한다. multi-port scan
제품 경로는 없다. 바인드는 loopback only.

확장 페어 토큰은 **stderr에 한 번** 출력된다 (stdout 금지, `/discover` 본문
금지). 패널 연결 필드에 붙여 넣거나 auto-detect 후 토큰을 붙여 넣는다.

agent Bearer (`VC_MCP_TOKEN`)와 확장 페어 토큰은 **별개** 시크릿이다.

설정 스니펫: [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).

### 5. agent가 소스를 패치한 뒤 검증

Vision Control은 소스를 대신 쓰지 않는다. HMR 이후 페어된 agent가 MCP
`vision_request_verification`으로 검증을 요청한다. 이 요청은 확장으로 보내는
조율 시그널이다. content script가 미리보기를 지우고 대상을 다시 식별한 뒤 실제
DOM에 어서션한다. 현재 패널에는 검증 요청 컨트롤이 없다. 오프라인 패널은 편집,
미리보기 제어, 저널 이력, context export를 제공하지만 검증 요청은 제공하지 않는다.

---

## 코딩 agent와 함께 쓰기

MCP 서버는 읽기 전용이다. **9개** 도구(읽기/투영 5 + 조율 시그널 4). 소스 변경
도구는 없고, 앞으로도 없다.

**읽기 / 투영**

- `vision_get_active_session`
- `vision_get_selection`
- `vision_get_changeset`
- `vision_get_source_context`
- `vision_get_verification_plan`

**조율 시그널**

- `vision_clear_preview`
- `vision_request_verification`
- `vision_mark_patch_started`
- `vision_mark_patch_completed`

페어되지 않으면 `not_paired` / empty / error를 반환한다. 오래된 검증
`passed: true`를 반환하지 않는다.

정책: [docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md).

### CLI

제품 CLI는 MCP 런처만 제공한다 (ADR-020).

```
vision-control mcp [args...]
vision-control help
```

| 명령 | 설명 |
| --- | --- |
| `mcp` | 단일 프로세스 MCP 서버 시작 (stdio + bridge `:4322`) |
| `help` | 도움말 |

구 제품 명령(`daemon`, `status`, `sessions`, `context`, `changes`, `verify`,
`preview`, `share`, `codemod`, `doctor`)은 제거되었다. export는 패널을 쓰고,
검증 조율은 페어된 MCP를 쓰며, 워크스페이스 건강은 `pnpm check` / `typecheck` /
`test` / `build`를 쓴다.

제품 경로에 `VC_DAEMON_URL`은 필요 없고 사용하지 않는다.

---

## 기능 요약

- 확장 편집 표면: overlay, inspector, multi-select, layout 패널, 저널, 패널 export
- origins: CSSOM + source map (`packages/map-origins`). HIGH는 map+range 필요.
  marker HIGH 제품 경로 없음.
- 선택적 MCP 브리지: 9 tools, stdio + `:4322` discover/bridge

상세: [docs/feature-matrix.md](./docs/feature-matrix.md).

---

## 한계

- 미리보기는 소스 변경이 아니다.
- always-on daemon 제품 경로 없음. 확장이 SoT, MCP는 선택.
- Firefox는 manifest-only (ADR-016). Chromium MV3가 주 타깃.
- 패널 바운드 V1 기능은 browser e2e가 패널 자동화 한계로 막혀 있음.
- 원격 협업 없음 (ADR-018).
- a11y repair는 advisory only (ADR-017).

상세: [docs/known-limitations.md](./docs/known-limitations.md).

---

## 기여자

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm boundaries
pnpm test:e2e
```

AI agent는 먼저 [AGENTS.md](./AGENTS.md)를 읽는다. 사람 기여자는
[CONTRIBUTING.md](./CONTRIBUTING.md).

문제 해결: [docs/troubleshooting.md](./docs/troubleshooting.md).
MCP 설정: [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).
