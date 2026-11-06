import type { Metadata } from "next";
import { SelfProfileView } from "@/components/me/self-profile-view";

export const metadata: Metadata = { title: "Meu perfil" };

export default function MePage() {
  return <SelfProfileView />;
}
