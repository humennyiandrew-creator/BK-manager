import type { SVGProps, ReactNode } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(children: ReactNode, props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => base(<><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /></>, p);
export const IconCareer = (p: IconProps) => base(<><path d="M4 21V10.5L12 4l8 6.5V21" /><rect x="9" y="13" width="6" height="8" /><circle cx="12" cy="8.5" r="1.6" /></>, p);
export const IconMessages = (p: IconProps) => base(<path d="M4 5h16v11H8l-4 4z" />, p);
export const IconCalendar = (p: IconProps) => base(<><rect x="3" y="5" width="18" height="15" rx="1" /><path d="M3 9h18M8 3v4M16 3v4" /></>, p);
export const IconRoster = (p: IconProps) => base(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 3-6 6-6s6 2 6 6" /><path d="M16 6a3 3 0 010 6M21 20c0-3-2-5-4-5.5" /></>, p);
export const IconSquadHub = (p: IconProps) => base(<><circle cx="12" cy="6" r="2.4" /><circle cx="6" cy="17" r="2.4" /><circle cx="18" cy="17" r="2.4" /><path d="M12 8.4V12M9 15l-1.5-1.5M15 15l1.5-1.5" /></>, p);
export const IconTraining = (p: IconProps) => base(<><path d="M4 8v8M20 8v8" /><path d="M4 12h4M16 12h4" /><rect x="8" y="10" width="8" height="4" rx="1" /></>, p);
export const IconPlaybook = (p: IconProps) => base(<><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 8h8M8 12l3 3 5-6" /></>, p);
export const IconTransfers = (p: IconProps) => base(<><path d="M6 8h14l-4-4M18 16H4l4 4" /></>, p);
export const IconDraft = (p: IconProps) => base(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5M3 8v6M21 8v6" /></>, p);
export const IconStaff = (p: IconProps) => base(<><circle cx="12" cy="7" r="3" /><path d="M5 20c0-4 3-7 7-7s7 3 7 7" /></>, p);
export const IconFacilities = (p: IconProps) => base(<><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-6h6v6" /></>, p);
export const IconBoard = (p: IconProps) => base(<><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M8 9h8M8 13h5" /></>, p);
export const IconFinances = (p: IconProps) => base(<><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1.2-5 3 2.2 2.6 5 3 5 1 5 3-2.2 3-5 3-5-1-5-3" /></>, p);
export const IconStandings = (p: IconProps) => base(<><path d="M4 21V13M10 21V8M16 21V3M4 13h4M10 8h4M16 3h4" /></>, p);
export const IconSettings = (p: IconProps) => base(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.3.9a7 7 0 00-2.1-1.2L14 3h-4l-.5 2.5a7 7 0 00-2.1 1.2l-2.3-.9-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.5c.8-.3 1.5-.7 2.1-1.2l2.3.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></>, p);
export const IconLocker = (p: IconProps) => base(<><rect x="4" y="3" width="7" height="18" rx="1" /><rect x="13" y="3" width="7" height="18" rx="1" /><path d="M9 11v2M15 11v2M6 6h3M15 6h3" /></>, p);
export const IconLeague = (p: IconProps) => base(<><path d="M4 5h16v4a8 8 0 01-16 0z" /><path d="M12 17v4M8 21h8" /><path d="M4 7H2v1a3 3 0 003 3M20 7h2v1a3 3 0 01-3 3" /></>, p);
export const IconNews = (p: IconProps) => base(<><rect x="3" y="4" width="15" height="16" rx="1" /><path d="M18 8h3v10a2 2 0 01-2 2H6" /><path d="M7 8h7M7 12h7M7 16h4" /></>, p);
export const IconCollapse = (p: IconProps) => base(<><path d="M15 6l-6 6 6 6" /></>, p);
export const IconExpand = (p: IconProps) => base(<><path d="M9 6l6 6-6 6" /></>, p);
export const IconBolt = (p: IconProps) => base(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />, p);
export const IconFlame = (p: IconProps) => base(<path d="M12 3c1 4 5 5.5 5 10a5 5 0 01-10 0c0-2.5 1.5-4 2.5-5 .3 1.7 1 2.6 2 3 0-3 .5-5.5.5-8z" />, p);
export const IconAlert = (p: IconProps) => base(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>, p);
export const IconCheck = (p: IconProps) => base(<path d="M4 12l5 5L20 6" />, p);
export const IconTarget = (p: IconProps) => base(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" /></>, p);
export const IconHeart = (p: IconProps) => base(<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />, p);
export const IconPlay = (p: IconProps) => base(<path d="M7 4l13 8-13 8z" />, p);
