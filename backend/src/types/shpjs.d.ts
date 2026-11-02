declare module 'shpjs' {
  function parseShp(buffer: ArrayBuffer | Buffer): Promise<GeoJSON.FeatureCollection>;
  export default parseShp;
}
