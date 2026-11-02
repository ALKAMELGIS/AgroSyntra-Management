import { useTranslation } from 'react-i18next';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import LanguageIcon from '@mui/icons-material/LanguageOutlined';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
];

/** Inline segmented language switch (used inside the account menu). */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (code) => {
    if (!code) return;
    i18n.changeLanguage(code);
    // Update document direction for RTL support
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
  };

  const current = (languages.find((l) => i18n.language?.startsWith(l.code)) || languages[0]).code;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <LanguageIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.875rem', flexGrow: 1 }}>Language</Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={current}
        onChange={(_, code) => changeLanguage(code)}
        aria-label="Language"
      >
        {languages.map((lang) => (
          <ToggleButton
            key={lang.code}
            value={lang.code}
            lang={lang.code}
            sx={{ px: 2.5, py: 0.75, fontSize: '0.75rem' }}
          >
            {lang.name}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
