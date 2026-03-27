import React from 'react';

/**
 * Legacy name kept for minimal diffs.
 * In UI we represent the "capocannoniere" award with a yellow ball (🟡).
 * No external deps; readable at 14–20px.
 */
export const PlasticCupIcon: React.FC<{ className?: string; beer?: boolean }> = ({
  className,
}) => {
  // Force yellow by default (even if callers pass a different text-* class).
  const cls = `${className || ''} text-yellow-400`;

  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden focusable="false">
      {/* Main yellow ball */}
      <circle cx="12" cy="12" r="8" className="fill-current" />
      {/* Subtle border for contrast on bright backgrounds */}
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        className="stroke-current"
        strokeWidth="1.2"
        opacity="0.25"
      />
      {/* Small highlight */}
      <circle cx="9" cy="9" r="2" className="fill-white" opacity="0.35" />
    </svg>
  );
};
