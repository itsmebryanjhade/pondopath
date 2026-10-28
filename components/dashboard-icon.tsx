// Original icon assets from the user-supplied dashboard design.
import type { ReactNode } from 'react';

type IconName =
  | 'search'
  | 'plus'
  | 'chevron'
  | 'bell'
  | 'sparkle'
  | 'wallet'
  | 'arrowIn'
  | 'arrowOut'
  | 'alert'
  | 'receipt'
  | 'calendar'
  | 'arrowRight'
  | 'more'

type IconProps = {
  name: IconName
  size?: number
}

export function DashboardIcon({ name, size = 18 }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
        <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 7V5.5A2.5 2.5 0 0 1 6.5 3H19v4" />
        <rect x="3" y="7" width="18" height="14" rx="3" />
        <path d="M16 13h5v4h-5a2 2 0 0 1 0-4Z" />
      </>
    ),
    arrowIn: (
      <>
        <path d="M12 3v13" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    arrowOut: (
      <>
        <path d="M12 21V8" />
        <path d="m17 13-5-5-5 5" />
        <path d="M5 3h14" />
      </>
    ),
    alert: (
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      </>
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    arrowRight: <path d="M5 12h14m-5-5 5 5-5 5" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  )
}
