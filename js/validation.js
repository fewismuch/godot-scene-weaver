import { state } from "./state.js";

export function effectiveName(o) {
  return (o.name || o.id || "").trim() || o.id;
}

export function findNameConflict(name, excludeIndex = -1) {
  const n = (name || "").trim();
  if (!n) return -1;
  for (let i = 0; i < state.objects.length; i++) {
    if (i === excludeIndex) continue;
    if (effectiveName(state.objects[i]) === n) return i;
  }
  return -1;
}

export function findDuplicateNames() {
  const seen = new Map();
  const dupes = [];
  state.objects.forEach((o, i) => {
    const n = effectiveName(o);
    if (seen.has(n)) {
      const prev = dupes.find(d => d.name === n);
      if (prev) prev.indices.push(i);
      else dupes.push({ name: n, indices: [seen.get(n), i] });
    } else {
      seen.set(n, i);
    }
  });
  return dupes;
}
