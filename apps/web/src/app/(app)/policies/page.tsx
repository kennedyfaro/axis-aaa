import type { Metadata } from "next";
import { PoliciesView } from "@/components/policies/policies-view";

export const metadata: Metadata = { title: "Políticas" };

export default function PoliciesPage() {
  return <PoliciesView />;
}
