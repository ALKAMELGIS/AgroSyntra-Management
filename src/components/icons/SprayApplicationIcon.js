import SvgIcon from '@mui/material/SvgIcon';

/**
 * Pest sprayer icon for PPP Application Records tab.
 * Uses currentColor so it matches MUI tab icon styling.
 */
export default function SprayApplicationIcon(props) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      {/* Pump handle */}
      <path d="M11.1 2.2h1.8v2h2v1.6h-5.8V4.2h2V2.2z" />
      {/* Tank cap */}
      <path d="M9.2 6.1c0-.88.72-1.6 1.6-1.6h2.4c.88 0 1.6.72 1.6 1.6V6.8H9.2V6.1z" />
      {/* Tank body */}
      <path d="M8.8 6.8h6.4c.66 0 1.2.54 1.2 1.2v10c0 .66-.54 1.2-1.2 1.2H8.8c-.66 0-1.2-.54-1.2-1.2v-10c0-.66.54-1.2 1.2-1.2z" />
      {/* Decorative bands */}
      <path d="M8.4 10h7.2v.85H8.4zm0 3.4h7.2v.85H8.4z" opacity="0.28" />
      {/* Bug silhouette */}
      <ellipse cx="12" cy="13.4" rx="1.5" ry="1.15" />
      <circle cx="11.25" cy="13" r="0.25" />
      <circle cx="12.75" cy="13" r="0.25" />
      <path d="M10.4 13.35c-.45-.2-.65-.45-.65-.7 0 .45.55.8 1.25-.8s1.25.35 1.25.8c0-.25-.2-.5-.65-.7" />
      <path
        d="M9.85 13.85l-.75-.45M9.85 14.45l-.8-.2M9.85 15.05l-.75.25M14.15 13.85l.75-.45M14.15 14.45l.8-.2M14.15 15.05l.75.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
      {/* Hose */}
      <path
        d="M8.2 9.2C5.4 9.2 3.6 11.2 3.6 13.8s1.8 4.2 4.6 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M8.2 18.4c2.2 0 4-1.2 5.4-2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      {/* Wand */}
      <path d="M14.8 13.5h1.75c.5 0 .95.4.95.9v4.05c0 .5-.45.9-.95.9H14.8c-.5 0-.95-.4-.95-.9v-4.05c0-.5.45-.9.95-.9z" />
      <path d="M15.65 12.2l.65-1.25 1.15.4-.65 1.25z" />
    </SvgIcon>
  );
}
