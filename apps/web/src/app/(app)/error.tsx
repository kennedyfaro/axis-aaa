"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel>
      <div className="px-6 py-16 text-center">
        <WarningCircle size={22} className="mx-auto text-danger" />
        <p className="mt-2 text-[14px] font-medium text-fg">A tela não carregou</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-dim">
          A consulta falhou ou o componente encontrou um estado inesperado. Tente novamente. Se persistir,
          verifique a API e os logs do processo.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
          Recarregar tela
        </Button>
      </div>
    </Panel>
  );
}
