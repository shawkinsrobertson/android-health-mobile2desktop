interface IconProps {
  className?: string;
}

export function LibrariesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 4.222V19.778C4 21.005 5.023 22 6.286 22H17.714C18.977 22 20 21.005 20 19.778V8.444C20 7.91357 19.7893 7.40486 19.4142 7.02979C19.0391 6.65471 18.5304 6.444 18 6.444H6.286C5.023 6.444 4 5.45 4 4.222ZM4 4.222C4 2.995 5.023 2 6.286 2H15.429C16.691 2 17.714 2.995 17.714 4.222V6.444" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
