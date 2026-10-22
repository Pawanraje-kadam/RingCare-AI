import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardLoading } from "@/components/layout/dashboard-loading";
import { TimelineClient } from "./timeline-client";

export const metadata: Metadata = {
  title: "Event timeline",
};

export default function TimelinePage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <TimelineClient />
    </Suspense>
  );
}
