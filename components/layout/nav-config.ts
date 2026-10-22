import {
  HeartHandshake,
  LayoutDashboard,
  ScrollText,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  group: "Monitor" | "Configure";
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    shortLabel: "Overview",
    description: "Recent activity, attention items, and an AI daily summary.",
    icon: LayoutDashboard,
    group: "Monitor",
    exact: true,
  },
  {
    href: "/dashboard/timeline",
    label: "Event timeline",
    shortLabel: "Timeline",
    description: "Search and inspect every recorded event with its reasoning.",
    icon: ScrollText,
    group: "Monitor",
  },
  {
    href: "/dashboard/insights",
    label: "AI insights",
    shortLabel: "Insights",
    description: "Grounded observations and comparisons across recorded activity.",
    icon: Sparkles,
    group: "Monitor",
  },
  {
    href: "/dashboard/caregiver",
    label: "Caregiver activity",
    shortLabel: "Caregiver",
    description: "Arrivals that match your configured caregiver rule.",
    icon: HeartHandshake,
    group: "Monitor",
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    shortLabel: "Settings",
    description: "Rules, caregiver criteria, AI preferences, and demo data.",
    icon: Settings2,
    group: "Configure",
  },
];

export function getActiveNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
}
