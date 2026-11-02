import { renderHook, act } from '@testing-library/react';
import { useRowSelection } from '../hooks/useRowSelection';

describe('useRowSelection', () => {
  test('toggles one id and select-all of the visible set', () => {
    const { result } = renderHook(() => useRowSelection());

    act(() => result.current.toggle('a'));
    expect(result.current.selectedIds.has('a')).toBe(true);

    act(() => result.current.toggleAll(['a', 'b', 'c']));
    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b', 'c']);

    act(() => result.current.toggleAll(['a', 'b', 'c']));
    expect(result.current.size).toBe(0);
  });

  test('select-all only adds or removes the given ids', () => {
    const { result } = renderHook(() => useRowSelection());
    act(() => result.current.toggle('keep'));
    act(() => result.current.toggleAll(['a', 'b']));
    expect(result.current.selectedIds.has('keep')).toBe(true);
    expect(result.current.selectedIds.has('a')).toBe(true);

    act(() => result.current.toggleAll(['a', 'b']));
    expect(result.current.selectedIds.has('keep')).toBe(true);
    expect(result.current.selectedIds.has('a')).toBe(false);
  });
});
