import type { Metadata } from "next";
import { EmployeeClock } from "@/components/EmployeeClock";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Kitchen clock",
  description: "Employee check-in for the Yogiplate kitchen.",
  path: "/employee",
  noIndex: true,
});

export default function EmployeePage() {
  return <EmployeeClock />;
}
