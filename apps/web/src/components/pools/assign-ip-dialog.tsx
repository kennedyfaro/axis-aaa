"use client";

import { useState } from "react";
import { LinkSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { IpPool } from "@aaa/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { useAssignIp, useEligibleVpnUsers } from "@/lib/queries";

export function AssignIpDialog({
  pool,
  open,
  onOpenChange,
  address,
  freeAddresses,
}: {
  pool: IpPool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: string;
  freeAddresses: string[];
}) {
  const { data, isPending } = useEligibleVpnUsers();
  const assign = useAssignIp();
  const [userId, setUserId] = useState("");
  const [selectedAddress, setSelectedAddress] = useState(address ?? freeAddresses[0] ?? "");
  const eligible = data?.items ?? [];
  const fixedAddress = Boolean(address);

  const submit = () => {
    if (!userId || !selectedAddress) return;
    assign.mutate(
      { poolId: pool.id, input: { userId, address: selectedAddress } },
      {
        onSuccess: (result) => {
          toast.success(`IP ${result.address} vinculado a ${result.user.name}.`);
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Falha ao vincular o endereço."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular IP fixo</DialogTitle>
          <DialogDescription>
            Pool {pool.name}, faixa {pool.startIp} a {pool.endIp}. O endereço será enviado ao NAS no
            Access-Accept como Framed-IP-Address.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3.5">
          {fixedAddress ? (
            <div>
              <p className="text-[12px] font-medium text-muted">Endereço</p>
              <p className="mt-1.5 rounded-sm border border-line bg-[#0b0e11] px-2.5 py-2 text-mono text-[13px] text-fg">
                {address}
              </p>
            </div>
          ) : (
            <Field
              label="Endereço livre"
              htmlFor="assign-address"
              hint={
                freeAddresses.length === 0
                  ? "Não há endereços livres neste pool."
                  : `${freeAddresses.length} endereços disponíveis.`
              }
            >
              <Select
                id="assign-address"
                value={selectedAddress}
                onChange={(event) => setSelectedAddress(event.target.value)}
                disabled={freeAddresses.length === 0}
              >
                {freeAddresses.length === 0 ? <option value="">Sem endereços livres</option> : null}
                {freeAddresses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label="Identidade"
            htmlFor="assign-user"
            hint={
              isPending
                ? "Carregando identidades VPN"
                : "Somente identidades ativas em grupos de VPN, ainda sem IP fixo."
            }
          >
            <Select
              id="assign-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={isPending || eligible.length === 0}
            >
              <option value="">
                {isPending ? "Carregando..." : eligible.length === 0 ? "Nenhuma identidade elegível" : "Selecione a identidade"}
              </option>
              {eligible.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.login})
                </option>
              ))}
            </Select>
          </Field>

          {!isPending && eligible.length === 0 ? (
            <p className="rounded-sm border border-warn/25 bg-warn/[0.06] px-3 py-2.5 text-[11px] leading-4 text-warn/90">
              Nenhuma identidade elegível. A identidade precisa estar ativa, pertencer a um grupo de
              VPN e ainda não ter IP fixo.
            </p>
          ) : (
            <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
              Ao liberar o endereço, o atributo Framed-IP-Address é removido do RADIUS na próxima
              sincronização.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={assign.isPending}
            disabled={!userId || !selectedAddress || eligible.length === 0}
          >
            <LinkSimple size={14} />
            Vincular endereço
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
