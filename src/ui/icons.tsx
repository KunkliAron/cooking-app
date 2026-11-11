import type { ReactNode } from "react";

const icon = (paths: ReactNode) =>
  function Icon({ size = 22 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };

export const BookIcon = icon(
  <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" transform="translate(0 -2)" />
    <path d="M9 8h7" />
  </>,
);
export const BasketIcon = icon(
  <>
    <path d="M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8z" />
    <path d="M8 9l4-6 4 6" />
    <path d="M9.5 13v3M14.5 13v3" />
  </>,
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.6-3.6" />
  </>,
);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const FlameIcon = icon(<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />);
export const ShuffleIcon = icon(
  <>
    <path d="M3 7h3.5c2 0 3.300 1 4.300 2.600l2.400 4.800C14.200 16 15.500 17 17.500 17H21" />
    <path d="M3 17h3.500c1.300 0 2.300-.4 3.100-1.200M21 7h-3.500c-1.300 0-2.300.4-3.100 1.200" />
    <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
  </>,
);
export const BackIcon = icon(<path d="M15 5l-7 7 7 7" />);
export const SignOutIcon = icon(
  <>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 16l-4-4 4-4M6 12h10" />
  </>,
);
export const PlayIcon = icon(<path d="M7 4.500v15l12-7.500z" fill="currentColor" />);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
