import type { Metadata } from "next";
import { PoolsView } from "@/components/pools/pools-view";

export const metadata: Metadata = { title: "Pools de IP" };

export default function PoolsPage() {
  return <PoolsView />;
}
