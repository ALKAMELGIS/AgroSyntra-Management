export function dropdownOptionsWithValue(optionString, value) {
  const options = (optionString || '').split(',').map((o) => o.trim()).filter(Boolean);
  const current = String(value || '').trim();
  if (current && !options.includes(current)) return [...options, current];
  return options;
}
