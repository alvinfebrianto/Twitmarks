export function toggleSelectId(
  set: ReadonlySet<number>,
  id: number
): Set<number> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function clearSelection(): Set<number> {
  return new Set();
}
