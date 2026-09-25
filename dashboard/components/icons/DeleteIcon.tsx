interface IconProps {
  className?: string;
}

export function DeleteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M17 15L11 9M17 9L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
<path d="M7.4 4.8C7.58629 4.55161 7.82786 4.35 8.10557 4.21115C8.38328 4.07229 8.68951 4 9 4H20C20.5304 4 21.0391 4.21071 21.4142 4.58579C21.7893 4.96086 22 5.46957 22 6V18C22 18.5304 21.7893 19.0391 21.4142 19.4142C21.0391 19.7893 20.5304 20 20 20H9C8.68951 20 8.38328 19.9277 8.10557 19.7889C7.82786 19.65 7.58629 19.4484 7.4 19.2L2.9 13.2C2.64036 12.8538 2.5 12.4327 2.5 12C2.5 11.5673 2.64036 11.1462 2.9 10.8L7.4 4.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
