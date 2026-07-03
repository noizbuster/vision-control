import type { ReactElement } from "react";

import styles from "./CssModulesCase.module.css";

/**
 * CSS Modules fixture (PRD §31.4 item 2). Demonstrates scoped `.module.css`
 * styling so the inspector / source resolver can exercise CSS Modules class
 * mapping against locally-scoped hashed class names.
 */
export function CssModulesCase(): ReactElement {
  return (
    <div className="p-6">
      <div className={styles.card} data-testid="css-modules-card">
        <h2 className={styles.title}>CSS Modules card</h2>
        <p className={styles.body}>Scoped styles via a co-located .module.css file.</p>
        <button type="button" className={styles.button}>
          Module-styled button
        </button>
      </div>
    </div>
  );
}
