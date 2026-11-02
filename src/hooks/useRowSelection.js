import { useCallback, useState } from 'react';

/**
 * Checkbox selection for data-entry tables: toggle one, toggle visible set, clear.
 */
export function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggle = useCallback((id) => {
    if (id == null) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids) => {
    const list = (ids || []).filter((id) => id != null);
    setSelectedIds((prev) => {
      const allOn = list.length > 0 && list.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) list.forEach((id) => next.delete(id));
      else list.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selectState = useCallback((ids) => {
    const list = (ids || []).filter((id) => id != null);
    const selectedCount = list.filter((id) => selectedIds.has(id)).length;
    return {
      allSelected: list.length > 0 && selectedCount === list.length,
      someSelected: selectedCount > 0 && selectedCount < list.length,
      selectedCount,
    };
  }, [selectedIds]);

  return { selectedIds, toggle, toggleAll, clear, selectState, size: selectedIds.size };
}
