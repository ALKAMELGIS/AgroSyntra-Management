import { memo } from 'react';
import { Box, useTheme } from '@mui/material';
import { keyframes } from '@mui/system';

/*
 * A very faint, decorative moon that sits behind the app content.
 *
 * - Fixed to the viewport, partially off-screen at the inline-end edge
 *   (mirrors automatically in RTL), never intercepts pointer events.
 * - Pure SVG + CSS: no images to download, GPU-friendly transform-only drift.
 * - Hidden from assistive tech, disabled for print, and motion stops when the
 *   user prefers reduced motion.
 */

const drift = keyframes`
  0%   { transform: translate3d(0, 0, 0) rotate(0deg); }
  50%  { transform: translate3d(0, 14px, 0) rotate(1.5deg); }
  100% { transform: translate3d(0, 0, 0) rotate(0deg); }
`;

const breathe = keyframes`
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 1; }
`;

function BackgroundMoon({ variant = 'app', sx }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isAuth = variant === 'auth';

  // Light mode: a pearl disc that is only a whisper off the page tone.
  // Dark mode: a cool silver disc at very low opacity with a soft glow.
  const c = isDark
    ? { lit: '#f3f6f2', mid: '#c9d2cb', shade: '#8a968f', crater: '#6f7b74', halo: 'rgba(200,230,210,0.09)', layer: 0.075 }
    : { lit: '#ffffff', mid: '#f6f7f4', shade: '#e6eae5', crater: '#d3d9d2', halo: 'rgba(31,122,77,0.045)', layer: 0.6 };

  return (
    <Box
      aria-hidden="true"
      className="ac-moon"
      sx={{
        position: 'fixed',
        zIndex: 0,
        pointerEvents: 'none',
        userSelect: 'none',
        top: isAuth ? { xs: '-70px', md: '6vh' } : { xs: 72, md: 96 },
        insetInlineEnd: isAuth ? { xs: '-90px', md: '-120px' } : { xs: '-110px', sm: '-130px', md: '-150px' },
        width: isAuth ? { xs: 280, md: 520 } : { xs: 260, sm: 360, md: 480, lg: 540 },
        aspectRatio: '1 / 1',
        opacity: c.layer,
        contain: 'strict',
        animation: `${drift} 48s ease-in-out infinite`,
        willChange: 'transform',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        '@media print': { display: 'none' },
        ...sx,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 400 400"
        sx={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="acMoonHalo" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor={c.halo} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="acMoonBody" cx="38%" cy="34%" r="70%" fx="34%" fy="30%">
            <stop offset="0%" stopColor={c.lit} />
            <stop offset="55%" stopColor={c.mid} />
            <stop offset="100%" stopColor={c.shade} />
          </radialGradient>
          <radialGradient id="acMoonCrater" cx="40%" cy="38%" r="65%">
            <stop offset="0%" stopColor={c.crater} stopOpacity="0.04" />
            <stop offset="100%" stopColor={c.crater} stopOpacity="0.2" />
          </radialGradient>
          <filter id="acMoonSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>

        {/* soft glow */}
        <Box
          component="circle"
          cx="200"
          cy="200"
          r="200"
          fill="url(#acMoonHalo)"
          sx={{ animation: `${breathe} 12s ease-in-out infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}
        />
        {/* disc */}
        <circle cx="200" cy="200" r="132" fill="url(#acMoonBody)" />
        {/* maria & craters — intentionally irregular, very low contrast */}
        <g filter="url(#acMoonSoft)">
          <ellipse cx="168" cy="160" rx="34" ry="26" fill="url(#acMoonCrater)" />
          <ellipse cx="232" cy="214" rx="44" ry="32" fill="url(#acMoonCrater)" opacity="0.8" />
          <ellipse cx="150" cy="236" rx="22" ry="18" fill="url(#acMoonCrater)" opacity="0.7" />
          <circle cx="250" cy="146" r="12" fill="url(#acMoonCrater)" opacity="0.8" />
          <circle cx="198" cy="276" r="9" fill="url(#acMoonCrater)" opacity="0.7" />
          <circle cx="122" cy="192" r="7" fill="url(#acMoonCrater)" opacity="0.6" />
          <circle cx="274" cy="252" r="6" fill="url(#acMoonCrater)" opacity="0.6" />
        </g>
        {/* gentle terminator so it reads as a sphere, not a dot */}
        <circle cx="200" cy="200" r="132" fill="none" stroke={c.shade} strokeOpacity="0.22" strokeWidth="1" />
      </Box>
    </Box>
  );
}

export default memo(BackgroundMoon);
