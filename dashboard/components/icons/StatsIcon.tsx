interface IconProps {
  className?: string;
}

export function StatsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7.172 15.7216V10.6226M11.623 15.7216V7.27759M15.828 15.7216V9.31959" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
<path d="M2.5 12C2.5 7.52198 2.5 5.28298 3.891 3.89098C5.283 2.50098 7.521 2.50098 12.001 2.50098C16.478 2.50098 18.718 2.50098 20.109 3.89098C21.5 5.28298 21.5 7.52098 21.5 12.001C21.5 16.478 21.5 18.718 20.109 20.109C18.718 21.5 16.479 21.5 12 21.5C7.522 21.5 5.283 21.5 3.891 20.109C2.501 18.718 2.5 16.479 2.5 12Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
