/** İstemci-güvenli (I/O yok): başvurunun tüm enstrümanları — eski tek-enstrüman kayıtları dahil. */
export function applicationInstruments(a: { instrument: string; instruments?: string[] }): string[] {
  return a.instruments?.length ? a.instruments : a.instrument ? [a.instrument] : [];
}
