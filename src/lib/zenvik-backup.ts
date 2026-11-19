/** Strict-typed copy of the ZENVIK-AGENT device backup (keeps the portfolio's type boundary). */
export function downloadZenvikBackup(): number {
  const items: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.startsWith("sb-")) continue; // never export sign-in tokens
    items[k] = localStorage.getItem(k) ?? "";
  }
  const exportedAt = new Date().toISOString();
  const data = { kind: "zenvik-agent-local-backup", version: 1, exportedAt, count: Object.keys(items).length, items };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `zenvik-agent-backup-${exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return data.count;
}
