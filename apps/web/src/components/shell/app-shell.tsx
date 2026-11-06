"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, SidebarContent } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandMenu } from "@/components/command-menu";
import { Brand } from "@/components/brand";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useHealth, useSession } from "@/lib/queries";

function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const selfOnly =
    session.data?.selfService === true &&
    session.data.permissions.length > 0 &&
    session.data.permissions.every((permission) => permission.startsWith("self."));

  useEffect(() => {
    if (session.isError) {
      router.replace("/login");
      router.refresh();
    }
  }, [session.isError, router]);

  useEffect(() => {
    if (selfOnly && pathname !== "/me") {
      router.replace("/me");
    }
  }, [selfOnly, pathname, router]);

  if (session.isPending || session.isError || (selfOnly && pathname !== "/me")) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <div className="flex flex-col items-center gap-2">
          <Brand />
          <p className="text-[11px] text-dim">Verificando sessão</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [command, setCommand] = useState(false);
  const { data: health } = useHealth();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommand((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SessionGate>
      <div className="min-h-dvh bg-bg">
        <Sidebar health={health?.services} />

        <Sheet open={mobileNav} onOpenChange={setMobileNav}>
          <SheetContent>
            <SidebarContent health={health?.services} mobile onNavigate={() => setMobileNav(false)} />
          </SheetContent>
        </Sheet>

        <div className="md:pl-16 xl:pl-[244px]">
          <Topbar onMenu={() => setMobileNav(true)} onSearch={() => setCommand(true)} />
          <main className="mx-auto w-full max-w-[1520px] px-4 py-5 md:px-6 md:py-6">{children}</main>
        </div>

        <CommandMenu open={command} onOpenChange={setCommand} />
      </div>
    </SessionGate>
  );
}
