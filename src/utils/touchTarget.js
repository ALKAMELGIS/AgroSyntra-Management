/**
 * Bigger hit area on touch screens without changing the layout: an invisible
 * ::after layer grows the control to at least 44 × 44 px (UI guideline for
 * fingers). Mouse and pen users see and get exactly the original size.
 */
export const touchHitArea = {
  position: 'relative',
  '@media (pointer: coarse)': {
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 'min(0px, calc((100% - 44px) / 2))',
      bottom: 'min(0px, calc((100% - 44px) / 2))',
      left: 'min(0px, calc((100% - 44px) / 2))',
      right: 'min(0px, calc((100% - 44px) / 2))',
    },
  },
};
