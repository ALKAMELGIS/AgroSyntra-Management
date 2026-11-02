import { Box } from '@mui/material';

/**
 * Touch-friendly horizontal scroll wrapper for spreadsheet-style content.
 */
export default function HorizontalScrollRegion({ children, height, sx, ...rest }) {
  return (
    <Box
      sx={{
        width: '100%',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        ...(height ? { height, maxHeight: height } : {}),
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
