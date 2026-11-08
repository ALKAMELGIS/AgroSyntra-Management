import { toLatLngRing } from './polygonRing';

test('array of [lat, lng] stays as it is', () => {
  expect(toLatLngRing([[24, 55], [24, 55.1], [24.1, 55.1]])).toEqual([[24, 55], [24, 55.1], [24.1, 55.1]]);
});
test('GeoJSON Polygon from the API is flipped to [lat, lng] and unclosed', () => {
  const g = { type: 'Polygon', coordinates: [[[55, 24], [55.001, 24], [55.001, 24.001], [55, 24.001], [55, 24]]] };
  expect(toLatLngRing(g)).toEqual([[24, 55], [24, 55.001], [24.001, 55.001], [24.001, 55]]);
});
test('JSON string, Feature and MultiPolygon work', () => {
  const poly = { type: 'Polygon', coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] };
  expect(toLatLngRing(JSON.stringify(poly))).toEqual([[2, 1], [4, 3], [6, 5]]);
  expect(toLatLngRing({ type: 'Feature', geometry: poly })).toEqual([[2, 1], [4, 3], [6, 5]]);
  expect(toLatLngRing({ type: 'MultiPolygon', coordinates: [poly.coordinates] })).toEqual([[2, 1], [4, 3], [6, 5]]);
});
test('empty or too small gives null', () => {
  expect(toLatLngRing(null)).toBeNull();
  expect(toLatLngRing([])).toBeNull();
  expect(toLatLngRing([[1, 2], [3, 4]])).toBeNull();
  expect(toLatLngRing('not json')).toBeNull();
});
