// components/WizardSteps.js — clickable breadcrumb for the explore wizard (B1/D2).
// Completed steps (step < current) are real buttons that jump back while the
// parent preserves prior selections; the current step carries aria-current;
// upcoming steps are inert until their prerequisites are met.
import ex from "../styles/Explore.module.css";

const STEPS = ["Metrics", "Location", "Results"];

export default function WizardSteps({ current, onNavigate }) {
  return (
    <ol className={ex.stepNav} aria-label="Progress">
      {STEPS.map((label, idx) => {
        const step = idx + 1;
        const isCurrent = step === current;
        const isDone = step < current;
        const className = `${ex.stepNavItem} ${
          isCurrent ? ex.stepNavCurrent : isDone ? ex.stepNavDone : ex.stepNavUpcoming
        }`;
        return (
          <li key={label} className={ex.stepNavLi}>
            {isDone ? (
              <button
                type="button"
                className={className}
                onClick={() => onNavigate?.(step)}
              >
                <span className={ex.stepNavMarker} aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                {label}
              </button>
            ) : (
              <span className={className} aria-current={isCurrent ? "step" : undefined}>
                <span className={ex.stepNavMarker} aria-hidden="true">{step}</span>
                {label}
              </span>
            )}
            {step < STEPS.length && <span className={ex.stepNavSep} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
