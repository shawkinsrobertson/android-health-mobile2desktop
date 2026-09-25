interface IconProps {
  className?: string;
}

// Unlike the other icons in this folder, this one is a fixed-color "P"
// monogram avatar badge, not a tintable line icon -- keeps its own
// baked-in colors (background/border/letter) rather than currentColor,
// since it's meant to look the same regardless of surrounding text color.
export function ProfilePlaceholderIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 26 26" fill="none" className={className} aria-hidden="true">
      <rect x="0.36" y="0.36" width="24.48" height="24.48" rx="12.24" fill="#FFFDFB" />
      <rect x="0.36" y="0.36" width="24.48" height="24.48" rx="12.24" stroke="#F1E7D6" strokeWidth="0.72" />
      <path
        d="M9.05442 17.24V7.36159H14.008C14.7376 7.36159 15.3376 7.49119 15.808 7.75039C16.288 8.00959 16.648 8.37439 16.888 8.84479C17.128 9.31519 17.248 9.87679 17.248 10.5296C17.248 11.1728 17.1232 11.7344 16.8736 12.2144C16.624 12.6944 16.2496 13.0688 15.7504 13.3376C15.2608 13.5968 14.6464 13.7264 13.9072 13.7264H10.9264V17.24H9.05442ZM10.9264 12.128H13.8496C14.3296 12.128 14.6992 11.9888 14.9584 11.7104C15.2272 11.4224 15.3616 11.0288 15.3616 10.5296C15.3616 10.1936 15.304 9.91039 15.1888 9.67999C15.0736 9.44959 14.9056 9.27199 14.6848 9.14719C14.464 9.02239 14.1856 8.95999 13.8496 8.95999H10.9264V12.128Z"
        fill="#C1573B"
      />
    </svg>
  );
}
