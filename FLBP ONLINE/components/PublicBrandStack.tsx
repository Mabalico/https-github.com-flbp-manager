import React from 'react';

type PublicBrandStackProps = {
  /** Additional wrapper classes (e.g., margins, alignment). */
  className?: string;
  /**
   * Base text tone. Default is tuned for dark headers.
   * Use a lighter tone on dark backgrounds; keep initials in beer color.
   */
  tone?: 'onDark' | 'onLight';
  /**
   * Optional responsive helper for ultra-compact layouts.
   * Example: "hidden sm:block" to avoid increasing header height on mobile.
   */
  responsiveClassName?: string;
};

export const PublicBrandStack: React.FC<PublicBrandStackProps> = ({
  className = '',
  tone = 'onDark',
  responsiveClassName = '',
}) => {
  const base = tone === 'onLight'
    ? 'text-slate-700'
    : 'text-white/75';

  return (
    <div
      className={`${base} text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em] sm:tracking-widest leading-[1.05] select-none ${responsiveClassName} ${className}`.trim()}
      aria-label="Federazione Lucense Beer Pong"
    >
      <span className="block"><span className="text-beer-500">F</span>EDERAZIONE</span>
      <span className="block"><span className="text-beer-500">L</span>UCENSE</span>
      <span className="block"><span className="text-beer-500">B</span>EER</span>
      <span className="block"><span className="text-beer-500">P</span>ONG</span>
    </div>
  );
};
