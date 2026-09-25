interface IconProps {
  className?: string;
}

export function InboxIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M14 19C17.771 19 19.657 19 20.828 17.828C21.999 16.656 22 14.771 22 11C22 7.229 22 5.343 20.828 4.172C19.656 3.001 17.771 3 14 3H10C6.229 3 4.343 3 3.172 4.172C2.001 5.344 2 7.229 2 11C2 14.771 2 16.657 3.172 17.828C3.825 18.482 4.7 18.771 6 18.898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M14 18.5C12.764 18.5 11.402 19 10.159 19.645C8.161 20.682 7.162 21.201 6.67 20.87C6.178 20.539 6.271 19.515 6.458 17.466L6.5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
