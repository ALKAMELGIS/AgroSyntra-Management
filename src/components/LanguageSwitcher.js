import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    // Update document direction for RTL support
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
    handleClose();
  };

  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

  return (
    <>
      <Tooltip title="Change Language">
        <IconButton
          color="inherit"
          onClick={handleClick}
          sx={{ ml: 1 }}
        >
          <LanguageIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {languages.map((lang) => (
          <MenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            selected={lang.code === currentLang.code}
            sx={{ 
              minWidth: 150,
              direction: lang.code === 'ar' ? 'rtl' : 'ltr',
            }}
          >
            <span style={{ marginRight: 8 }}>{lang.flag}</span>
            {lang.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
