interface IconProps {
  className?: string;
}

export function MicrophoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M16 6C16 3.79086 14.2091 2 12 2C9.79086 2 8 3.79086 8 6V11C8 13.2091 9.79086 15 12 15C14.2091 15 16 13.2091 16 11V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M6 16.292C6.74995 17.1442 7.67309 17.8265 8.70776 18.2935C9.74243 18.7605 10.8648 19.0013 12 19C13.1352 19.0013 14.2576 18.7605 15.2922 18.2935C16.3269 17.8265 17.25 17.1442 18 16.292M12 19V22M10 22H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
