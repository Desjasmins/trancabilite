"use client";

// Connexion WebUSB vers une imprimante Zebra (impression ZPL directe).
// Reste forcément côté navigateur (Chrome/Edge + contexte sécurisé).

/* eslint-disable @typescript-eslint/no-explicit-any */

interface UsbState {
  dev: any;
  ep: number;
}

let usb: UsbState | null = null;

export function isUsbConnected() {
  return usb !== null;
}

async function claimDevice(dev: any): Promise<boolean> {
  await dev.open();
  if (dev.configuration === null) await dev.selectConfiguration(1);
  for (const intf of dev.configuration.interfaces) {
    const alt = intf.alternates[0];
    const out = alt.endpoints.find((e: any) => e.direction === "out");
    if (out) {
      await dev.claimInterface(intf.interfaceNumber);
      usb = { dev, ep: out.endpointNumber };
      return true;
    }
  }
  return false;
}

export type UsbOutcome = "ok" | "unsupported" | "cancelled" | "noiface";

export async function connectUSB(): Promise<UsbOutcome> {
  const nav = navigator as any;
  if (!nav.usb) return "unsupported";
  try {
    const dev = await nav.usb.requestDevice({ filters: [] });
    const ok = await claimDevice(dev);
    return ok ? "ok" : "noiface";
  } catch {
    return "cancelled";
  }
}

export async function sendZPL(zpl: string): Promise<boolean> {
  if (!usb) return false;
  try {
    await usb.dev.transferOut(usb.ep, new TextEncoder().encode(zpl));
    return true;
  } catch {
    return false;
  }
}

export async function tryReconnectUSB() {
  const nav = navigator as any;
  if (!nav.usb) return;
  try {
    const ds = await nav.usb.getDevices();
    if (ds && ds.length) await claimDevice(ds[0]);
  } catch {
    /* ignore */
  }
}
