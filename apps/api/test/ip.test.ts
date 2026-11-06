import { describe, expect, it } from "vitest";
import { ipv4Range, ipv4ToNumber, numberToIpv4 } from "../src/common/ip";

describe("ipv4", () => {
  it("converte endereços para inteiro e de volta", () => {
    expect(ipv4ToNumber("192.168.128.2")).toBe(3232268290);
    expect(numberToIpv4(3232268290)).toBe("192.168.128.2");
    expect(ipv4ToNumber("0.0.0.0")).toBe(0);
    expect(ipv4ToNumber("255.255.255.255")).toBe(4294967295);
  });

  it("rejeita endereços inválidos", () => {
    expect(ipv4ToNumber("192.168.128")).toBeNull();
    expect(ipv4ToNumber("192.168.128.256")).toBeNull();
    expect(ipv4ToNumber("192.168.128.-1")).toBeNull();
    expect(ipv4ToNumber("192.168.128.a")).toBeNull();
  });

  it("gera a faixa inclusiva do pool", () => {
    const addresses = ipv4Range("192.168.128.2", "192.168.128.69");
    expect(addresses).toHaveLength(68);
    expect(addresses[0]).toBe("192.168.128.2");
    expect(addresses[67]).toBe("192.168.128.69");
  });

  it("retorna vazio para faixa invertida", () => {
    expect(ipv4Range("192.168.128.69", "192.168.128.2")).toEqual([]);
  });
});
