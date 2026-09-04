import { CompaniesClient } from "@/components/companies/companies-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return <CompaniesClient />;
}
