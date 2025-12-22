"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartBarIcon,
  DocumentTextIcon,
  PresentationChartLineIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export default function CompanySidebar({ ticker }: { ticker: string }) {
  const pathname = usePathname();

  const items = [
    {
      label: "Overview",
      href: `/company/${ticker}`,
      icon: Squares2X2Icon,
      active: pathname === `/company/${ticker}`,
    },
    {
      label: "Financials",
      href: `/company/${ticker}/financials`,
      icon: ChartBarIcon,
      active: pathname === `/company/${ticker}/financials`,
    },
    {
      label: "Analysis",
      href: `/company/${ticker}/analysis`,
      icon: PresentationChartLineIcon,
      active: pathname === `/company/${ticker}/analysis`,
    },
    {
      label: "Report",
      href: `/company/${ticker}/report`,
      icon: DocumentTextIcon,
      active: pathname === `/company/${ticker}/report`,
    },
  ];

  return (
    <aside className="w-48 shrink-0 border-r border-gray-200 bg-white">
      <div className="sticky top-0 h-screen px-2 py-6">
        {/* Header */}
        <div className="px-3 mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Company
          </div>
          <div className="text-sm font-bold text-black truncate">
            {ticker}
          </div>
        </div>

        {/* Nav */}
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  item.active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    item.active
                      ? "text-blue-700"
                      : "text-gray-400 group-hover:text-gray-700"
                  )}
                />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}