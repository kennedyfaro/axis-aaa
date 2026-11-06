import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="w-full max-w-sm text-center">
        <BrandMark className="mx-auto text-fg" size={34} />
        <p className="mt-4 text-mono text-[11px] text-dim">404</p>
        <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-fg">Página não encontrada</h1>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">
          O endereço não existe neste painel ou foi movido.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </div>
    </main>
  );
}
