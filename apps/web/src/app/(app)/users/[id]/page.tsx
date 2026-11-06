import type { Metadata } from "next";
import { UserDetailView } from "@/components/users/user-detail-view";

export const metadata: Metadata = { title: "Detalhe da identidade" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailView id={id} />;
}
