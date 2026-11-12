import { forwardRef, useCallback } from 'react';
import { TableContainer } from '@mui/material';
import useFitHeight from '../../hooks/useFitHeight';

/**
 * TableContainer for a page's main table / sheet: it fills the screen from
 * where it starts to the bottom (minus `bottom` px for sheet tabs or a footer),
 * scrolls both ways inside itself and keeps the pinned header in view.
 * Replaces fixed heights (maxHeight 480 / 520 / 68vh…) that left empty space on
 * big screens and pushed the header off small ones.
 */
const FitTableContainer = forwardRef(function FitTableContainer({ bottom = 16, minHeight = 260, sx, ...props }, outerRef) {
  const [fitRef, maxHeight] = useFitHeight({ bottom, min: minHeight });
  const setRef = useCallback((el) => {
    fitRef(el);
    if (typeof outerRef === 'function') outerRef(el);
    else if (outerRef) outerRef.current = el;
  }, [fitRef, outerRef]);
  return (
    <TableContainer
      ref={setRef}
      {...props}
      sx={[{ maxHeight: maxHeight ?? undefined }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
});

export default FitTableContainer;
