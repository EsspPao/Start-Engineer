export function normalizeAppSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function appSearchRank(app: { name: string; processName: string }, query: string) {
  const term = normalizeAppSearch(query);
  if (!term) return 0;
  const name = normalizeAppSearch(app.name);
  const process = normalizeAppSearch(app.processName);
  if (name === term) return 0;
  if (name.startsWith(term)) return 1;
  if (name.includes(term)) return 2;
  if (Array.from(term).length < 3) return Infinity;
  if (process === term) return 3;
  if (process.startsWith(term)) return 4;
  if (process.includes(term)) return 5;
  return Infinity;
}
