import React from "react";

export function Icon({ name }: { name: string }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (name === "activity") return <svg {...common}><path d="M4 13h3l2-6 4 10 2-6h5" /><rect x="3" y="3" width="18" height="18" rx="5" /></svg>;
  if (name === "compass") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5 5-2Z" /></svg>;
  if (name === "briefcase") return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5h8v2M3 12h18" /></svg>;
  if (name === "wrench") return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5L15 12l-3-3 2.7-2.7Z" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a8 8 0 0 0 0-6M4.6 9a8 8 0 0 0 0 6M8 4.8a8 8 0 0 1 8 0M16 19.2a8 8 0 0 1-8 0" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  if (name === "play") return <svg {...common}><path d="m8 5 11 7-11 7V5Z" /></svg>;
  if (name === "star") return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
  if (name === "gamepad") return <svg {...common}><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.1 3.4a2 2 0 0 1-3.3.8L14 15h-4l-2.4 2.4a2 2 0 0 1-3.3-.8l-1.1-3.4A4 4 0 0 1 7 8Z" /><path d="M7 11v4M5 13h4M16 12h.01M18 14h.01" /></svg>;
  if (name === "folder") return <svg {...common}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></svg>;
  if (name === "music") return <svg {...common}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
  if (name === "code") return <svg {...common}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>;
  return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
}

export function BrandLogo() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="brand-gradient" x1="4" y1="0" x2="60" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#50d5ef" /><stop offset=".52" stopColor="#5c6df4" /><stop offset="1" stopColor="#a258eb" /></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#brand-gradient)" /><rect x="3" y="3" width="58" height="30" rx="15" fill="white" opacity=".16" /><path d="M32 13.5 36.3 27.7 50.5 32l-14.2 4.3L32 50.5l-4.3-14.2L13.5 32l14.2-4.3L32 13.5Z" fill="white" /></svg>;
}
