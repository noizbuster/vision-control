import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { ConditionalClass } from "./fixtures/ConditionalClass.js";
import { CrossOriginIframe } from "./fixtures/CrossOriginIframe.js";
import { CssGridCase } from "./fixtures/CssGridCase.js";
import { CssModulesCase } from "./fixtures/CssModulesCase.js";
import { HmrDemo } from "./fixtures/HmrDemo.js";
import { IdenticalButtons } from "./fixtures/IdenticalButtons.js";
import { MvpBoard } from "./fixtures/MvpBoard.js";
import { NestedLayout } from "./fixtures/NestedLayout.js";
import { PortalCase } from "./fixtures/PortalCase.js";
import { PrivateFields } from "./fixtures/PrivateFields.js";
import { Reparent } from "./fixtures/Reparent.js";
import { RepeatedList } from "./fixtures/RepeatedList.js";
import { ResizeFlex } from "./fixtures/ResizeFlex.js";
import { ResponsiveBreakpoints } from "./fixtures/ResponsiveBreakpoints.js";
import { SameOriginIframe } from "./fixtures/SameOriginIframe.js";
import { ScrollContainer } from "./fixtures/ScrollContainer.js";
import { ShadowDomClosed } from "./fixtures/ShadowDomClosed.js";
import { ShadowDomOpen } from "./fixtures/ShadowDomOpen.js";
import { StyleEdit } from "./fixtures/StyleEdit.js";
import { TextEdit } from "./fixtures/TextEdit.js";
import { TransformedAncestor } from "./fixtures/TransformedAncestor.js";

type FixtureComponent = () => ReactElement;

interface RouteDefinition {
  readonly path: string;
  readonly label: string;
  readonly component: FixtureComponent;
}

const ROUTES: RouteDefinition[] = [
  { path: "/", label: "MVP Board", component: MvpBoard },
  { path: "/reparent", label: "Reparent", component: Reparent },
  { path: "/text-edit", label: "Text Edit", component: TextEdit },
  { path: "/style-edit", label: "Style Edit", component: StyleEdit },
  { path: "/resize-flex", label: "Resize Flex", component: ResizeFlex },
  { path: "/nested-layout", label: "Nested Layout", component: NestedLayout },
  { path: "/transformed-ancestor", label: "Transformed Ancestor", component: TransformedAncestor },
  { path: "/scroll-container", label: "Scroll Container", component: ScrollContainer },
  { path: "/repeated-list", label: "Repeated List", component: RepeatedList },
  { path: "/identical-buttons", label: "Identical Buttons", component: IdenticalButtons },
  { path: "/conditional-class", label: "Conditional Class", component: ConditionalClass },
  { path: "/portal-case", label: "Portal Case", component: PortalCase },
  { path: "/same-origin-iframe", label: "Same-Origin Iframe", component: SameOriginIframe },
  { path: "/cross-origin-iframe", label: "Cross-Origin Iframe", component: CrossOriginIframe },
  { path: "/shadow-dom-open", label: "Shadow DOM Open", component: ShadowDomOpen },
  { path: "/shadow-dom-closed", label: "Shadow DOM Closed", component: ShadowDomClosed },
  { path: "/private-fields", label: "Private Fields", component: PrivateFields },
  { path: "/css-modules", label: "CSS Modules", component: CssModulesCase },
  { path: "/css-grid", label: "CSS Grid", component: CssGridCase },
  {
    path: "/responsive-breakpoints",
    label: "Responsive Breakpoints",
    component: ResponsiveBreakpoints,
  },
  { path: "/hmr-demo", label: "HMR Demo", component: HmrDemo },
];

function Nav(): ReactElement {
  return (
    <nav className="border-b border-slate-200 bg-white p-4">
      <ul className="flex flex-wrap gap-3">
        {ROUTES.map((route) => (
          <li key={route.path}>
            <a
              href={route.path}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              {route.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface RouteContentProps {
  readonly route: string;
}

function RouteContent({ route }: RouteContentProps): ReactElement {
  const match = ROUTES.find((definition) => definition.path === route);
  const Component = match?.component ?? MvpBoard;
  return <Component />;
}

export function App(): ReactElement {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = (): void => {
      setRoute(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="p-6">
        <RouteContent route={route} />
      </main>
    </div>
  );
}
