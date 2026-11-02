import React from 'react';
import { render } from '@testing-library/react';

test('App module can be imported without crashing', () => {
  expect(() => require('./App')).not.toThrow();
});
