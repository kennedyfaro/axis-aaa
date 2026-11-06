import type { Metadata } from "next";
import { DevicesView } from "@/components/devices/devices-view";

export const metadata: Metadata = { title: "Equipamentos" };

export default function DevicesPage() {
  return <DevicesView />;
}
