"use client";

import { useDeferredValue, useState } from "react";
import { Copy, DotsThree, Key, MagnifyingGlass, ShieldCheck, TerminalWindow, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Device } from "@aaa/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateDeviceDialog } from "@/components/devices/create-device-dialog";
import { DeviceConfigDialog } from "@/components/devices/device-config-dialog";
import { DeviceSecretDialog } from "@/components/devices/device-secret-dialog";
import { EditDeviceAccessDialog } from "@/components/devices/edit-device-access-dialog";
import { RotateDeviceSecretDialog } from "@/components/devices/rotate-device-secret-dialog";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { DeviceStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { DEVICE_KIND_LABEL, DEVICE_STATUS_LABEL, relativeTime, VENDOR_LABEL } from "@/lib/format";
import { useDeleteDevice, useDevices } from "@/lib/queries";

const ENVIRONMENT_LABEL = { production: "Produção", staging: "Homologacao", lab: "Laboratorio" } as const;

function DeviceActions({
  device,
  onConfig,
  onRotate,
  onDelete,
  onAccess,
}: {
  device: Device;
  onConfig: (device: Device) => void;
  onRotate: (device: Device) => void;
  onDelete: (device: Device) => void;
  onAccess: (device: Device) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${device.name}`}>
          <DotsThree size={17} weight="bold" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onConfig(device)}>
          <TerminalWindow size={14} />
          Configuração AAA
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(device.nasIp);
            toast.success("NAS-IP copiado.");
          }}
        >
          <Copy size={14} />
          Copiar NAS-IP
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAccess(device)}>
          <ShieldCheck size={14} />
          Grupos autorizados
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onRotate(device)}>
          <Key size={14} />
          Alterar segredo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={() => onDelete(device)}>
          <Trash size={14} />
          Excluir equipamento
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DevicesView() {
  const { data, isPending, isError, error, refetch } = useDevices();
  const remove = useDeleteDevice();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [configDevice, setConfigDevice] = useState<Device | null>(null);
  const [rotateDevice, setRotateDevice] = useState<Device | null>(null);
  const [secretInfo, setSecretInfo] = useState<{ name: string; secret: string } | null>(null);
  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null);
  const [accessDevice, setAccessDevice] = useState<Device | null>(null);

  const devices = (data?.items ?? []).filter((device) => {
    if (status !== "all" && device.status !== status) return false;
    if (vendor !== "all" && device.vendor !== vendor) return false;
    if (!deferredQuery) return true;
    const term = deferredQuery.toLowerCase();
    return (
      device.name.toLowerCase().includes(term) ||
      device.model.toLowerCase().includes(term) ||
      device.site.toLowerCase().includes(term) ||
      device.nasIp.includes(term)
    );
  });

  const online = (data?.items ?? []).filter((device) => device.status === "online").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Equipamentos"
        description="NAS clients autorizados a consultar o RADIUS. Cada fabricante tem um perfil de integração próprio."
        actions={<CreateDeviceDialog />}
      />

      <Panel
        title="Inventário de rede"
        hint={data ? `${online} de ${data.items.length} online` : "Carregando inventário"}
        flush
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, modelo, local ou IP"
              className="pl-8"
              aria-label="Buscar equipamentos"
            />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por status">
            <option value="all">Todos os status</option>
            {Object.entries(DEVICE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={vendor} onChange={(event) => setVendor(event.target.value)} aria-label="Filtrar por fabricante">
            <option value="all">Todos os fabricantes</option>
            {Object.entries(VENDOR_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <span className="ml-auto text-[11px] text-dim">{devices.length} registros</span>
        </div>

        {isError ? (
          <ErrorState onRetry={() => refetch()} message={error.message} />
        ) : isPending ? (
          <TableSkeleton rows={6} cols={6} />
        ) : devices.length === 0 ? (
          <EmptyState
            title="Nenhum equipamento neste filtro"
            description="Ajuste a busca ou cadastre um NAS para comecar a receber requisições RADIUS."
            action={<CreateDeviceDialog />}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Equipamento</TH>
                    <TH>Fabricante</TH>
                    <TH className="hidden lg:table-cell">Tipo</TH>
                    <TH>NAS</TH>
                    <TH className="hidden xl:table-cell">Local</TH>
                    <TH>Status</TH>
                    <TH className="hidden lg:table-cell">Último contato</TH>
                    <TH className="w-10">
                      <span className="sr-only">Ações</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {devices.map((device) => (
                    <TR key={device.id}>
                      <TD>
                        <span className="block text-mono text-[12px] text-fg">{device.name}</span>
                        <span className="mt-0.5 block max-w-[36ch] truncate text-[11px] text-dim">{device.model}</span>
                      </TD>
                      <TD>
                        <Badge tone="outline">{VENDOR_LABEL[device.vendor]}</Badge>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-[11px] text-muted">{DEVICE_KIND_LABEL[device.kind]}</span>
                      </TD>
                      <TD>
                        <span className="flex items-center gap-1.5">
                          <span className="text-mono text-[11.5px] text-fg">{device.nasIp}</span>
                          {device.nasIp === "0.0.0.0/0" ? <Badge tone="warn">padrão</Badge> : null}
                        </span>
                        <span className="block text-mono text-[10px] text-dim">{device.nasIdentifier}</span>
                      </TD>
                      <TD className="hidden xl:table-cell">
                        <span className="block text-[11.5px] text-muted">{device.site}</span>
                        <span className="block text-[10px] text-dim">{ENVIRONMENT_LABEL[device.environment]}</span>
                      </TD>
                      <TD>
                        <DeviceStatusBadge status={device.status} />
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-mono text-[11px] text-dim">{relativeTime(device.lastSeenAt)}</span>
                      </TD>
                      <TD>
                        <DeviceActions device={device} onConfig={setConfigDevice} onRotate={setRotateDevice} onDelete={setDeleteDevice} onAccess={setAccessDevice} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <ul className="divide-y divide-line/70 md:hidden">
              {devices.map((device) => (
                <li key={device.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-mono text-[12px] text-fg">{device.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-dim">{device.model}</p>
                    </div>
                    <DeviceActions device={device} onConfig={setConfigDevice} onRotate={setRotateDevice} onDelete={setDeleteDevice} onAccess={setAccessDevice} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <DeviceStatusBadge status={device.status} />
                    <Badge tone="outline">{VENDOR_LABEL[device.vendor]}</Badge>
                    <span className="text-mono text-[10px] text-dim">{device.nasIp}</span>
                    {device.nasIp === "0.0.0.0/0" ? <Badge tone="warn">padrão</Badge> : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10.5px] text-dim">
                    <span>{device.site}</span>
                    <span>{relativeTime(device.lastSeenAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="border-t border-line px-4 py-2.5 text-[10.5px] leading-4 text-dim">
          O painel não abre SSH nem executa comandos nos equipamentos. Perfis de fabricante são
          documentação de integração, aplicada manualmente pela equipe de redes.
        </p>
      </Panel>

      <DeviceConfigDialog device={configDevice} onOpenChange={(open) => !open && setConfigDevice(null)} />

      {accessDevice ? (
        <EditDeviceAccessDialog
          key={accessDevice.id}
          device={accessDevice}
          open
          onOpenChange={(next) => {
            if (!next) setAccessDevice(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteDevice)}
        onOpenChange={(open) => {
          if (!open) setDeleteDevice(null);
        }}
        title={deleteDevice ? `Excluir ${deleteDevice.name}?` : "Excluir equipamento"}
        description="O equipamento sai do inventário e da tabela nas. Sessões de accounting existentes não são apagadas. O cliente deixa de ser aceito em até 60 segundos."
        confirmLabel="Excluir equipamento"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleteDevice) return;
          remove.mutate(deleteDevice.id, {
            onSuccess: () => {
              toast.success("Equipamento removido. O acesso RADIUS expira em até 60 segundos.");
              setDeleteDevice(null);
            },
            onError: (error) => toast.error(error instanceof ApiError ? error.message : "Falha ao excluir equipamento."),
          });
        }}
      />

      {secretInfo ? (
        <DeviceSecretDialog
          deviceName={secretInfo.name}
          secret={secretInfo.secret}
          open
          onOpenChange={(next) => {
            if (!next) setSecretInfo(null);
          }}
        />
      ) : null}

      {rotateDevice ? (
        <RotateDeviceSecretDialog
          key={rotateDevice.id}
          device={rotateDevice}
          open
          onOpenChange={(next) => {
            if (!next) setRotateDevice(null);
          }}
          onRotated={(info) => {
            setSecretInfo(info);
            setRotateDevice(null);
          }}
        />
      ) : null}
    </div>
  );
}
