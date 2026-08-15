export type LatLon = { lat: number; lon: number };

export const MAP_WIDTH = 320;
export const MAP_HEIGHT = 210;

// Equirectangular, with the x axis squeezed by cos(46.15°) so the country is
// not stretched sideways. The outline and the markers are projected the same
// way, which is the only reason a city plotted from its real coordinates lands
// where it belongs on the shape.
const LON_MIN = 13.35;
const LON_SPAN = 3.3;
const LAT_MAX = 46.9;
const LAT_SPAN = 1.5;

export function project(at: LatLon): { x: number; y: number } {
  return {
    x: ((at.lon - LON_MIN) / LON_SPAN) * MAP_WIDTH,
    y: ((LAT_MAX - at.lat) / LAT_SPAN) * MAP_HEIGHT,
  };
}

export function onMap(at: LatLon): boolean {
  const { x, y } = project(at);
  return x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_HEIGHT;
}

// Hand-plotted from ~60 border waypoints in the projection above: a coarse
// silhouette on purpose, because it renders about 14rem wide and any more
// detail would collapse into noise.
export const SLOVENIA_OUTLINE =
  "M35.4 53.5L53.3 60.2L73.7 65.1L91.2 65.8L113.5 63.7L130.9 65.8L143.5 56L157.1 39.9L177.5 35.7L200.7 36.4L223 28L238.5 25.9L258.9 30.1L267.2 16.8L275.4 7.7L285.1 3.4L290.9 9.8L298.7 28L307.4 47.6L316.1 59.5L307.4 60.2L293.8 53.2L281.2 60.2L274.4 70L261.3 70L251.2 82.6L240.5 93.8L227.9 105L224 123.2L227.9 144.9L210.4 159.6L193.9 175L188.1 190.4L184.8 201.2L177.5 205.1L170.4 207.1L157.6 200.2L139.6 194.6L130.7 191.9L120.2 182L116.2 176L106.7 182L101.8 189.7L86.9 193.5L72.7 198.8L62.9 198.7L48.5 202.3L33.9 202.7L24 202.7L19.9 191.4L30.1 190.5L36.8 189.3L37.4 184.9L39.7 182.8L28.1 168L27.2 155.4L22.3 145.6L26.2 130.9L14.5 118.3L12.6 100.8L2.4 85.4L8.7 77.7L20.4 67.2L30.1 62.3Z";

// Every town in data/shelters.yaml, plus the larger municipal centres a new
// shelter is most likely to appear in. A town missing from here costs its
// shelter a marker, never its row in the list.
const CITIES: Record<string, LatLon> = {
  Ajdovščina: { lat: 45.8878, lon: 13.9078 },
  Bled: { lat: 46.3683, lon: 14.1147 },
  Brežice: { lat: 45.9044, lon: 15.5919 },
  Celje: { lat: 46.2311, lon: 15.2683 },
  Črnomelj: { lat: 45.5697, lon: 15.1897 },
  Domžale: { lat: 46.1381, lon: 14.5944 },
  Dramlje: { lat: 46.2686, lon: 15.3733 },
  Horjul: { lat: 46.0233, lon: 14.2986 },
  Idrija: { lat: 46.0022, lon: 14.0272 },
  Izola: { lat: 45.5386, lon: 13.66 },
  Jesenice: { lat: 46.4367, lon: 14.0567 },
  Kamnik: { lat: 46.2256, lon: 14.6117 },
  Kočevje: { lat: 45.6428, lon: 14.8628 },
  Koper: { lat: 45.5481, lon: 13.7302 },
  Kranj: { lat: 46.2389, lon: 14.3556 },
  Krško: { lat: 45.9589, lon: 15.4919 },
  Lendava: { lat: 46.5644, lon: 16.4519 },
  Ljubljana: { lat: 46.0569, lon: 14.5058 },
  Ljutomer: { lat: 46.5192, lon: 16.1969 },
  Maribor: { lat: 46.5547, lon: 15.6459 },
  "Moravske Toplice": { lat: 46.6853, lon: 16.2222 },
  "Murska Sobota": { lat: 46.6583, lon: 16.1619 },
  "Nova Gorica": { lat: 45.955, lon: 13.6483 },
  "Novo mesto": { lat: 45.801, lon: 15.171 },
  Ormož: { lat: 46.4092, lon: 16.155 },
  Piran: { lat: 45.5286, lon: 13.5683 },
  Podlog: { lat: 46.2472, lon: 15.1339 },
  Postojna: { lat: 45.775, lon: 14.2136 },
  Ptuj: { lat: 46.42, lon: 15.87 },
  Radovljica: { lat: 46.3439, lon: 14.1719 },
  "Ravne na Koroškem": { lat: 46.545, lon: 14.9639 },
  Sevnica: { lat: 46.0075, lon: 15.3147 },
  Sežana: { lat: 45.7078, lon: 13.8722 },
  "Slovenj Gradec": { lat: 46.5106, lon: 15.0806 },
  "Slovenske Konjice": { lat: 46.3369, lon: 15.4225 },
  "Škofja Loka": { lat: 46.1656, lon: 14.306 },
  Šentjur: { lat: 46.2167, lon: 15.3961 },
  Tolmin: { lat: 46.1836, lon: 13.7326 },
  Trbovlje: { lat: 46.155, lon: 15.0533 },
  Trebnje: { lat: 45.908, lon: 15.01 },
  Velenje: { lat: 46.3592, lon: 15.1106 },
  Vitovlje: { lat: 45.9231, lon: 13.7683 },
  Vransko: { lat: 46.2447, lon: 14.9525 },
  Vrhnika: { lat: 45.9667, lon: 14.2944 },
  Žalec: { lat: 46.2517, lon: 15.165 },
};

// Shelters type their own town names, so match without case or the three
// Slovenian accents rather than lose a marker to "Skofja Loka".
const FOLDED: Record<string, string> = {
  č: "c",
  ć: "c",
  đ: "d",
  š: "s",
  ž: "z",
};

// Also the identity the map groups shelters by, so two shelters that spell
// their shared town differently still land on one marker rather than two
// markers on the same spot.
export function cityKey(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[čćđšž]/g, (accent) => FOLDED[accent] ?? accent);
}

const BY_KEY = new Map(
  Object.entries(CITIES).map(([city, at]) => [cityKey(city), at]),
);

export function cityAt(city: string): LatLon | undefined {
  return BY_KEY.get(cityKey(city));
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(from: LatLon, to: LatLon): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const half =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(half));
}

// Distance to the town, not to the shelter's door, so round hard enough that
// nobody mistakes it for directions.
export function formatKm(km: number): string {
  return km < 1 ? "manj kot 1 km" : `${Math.round(km)} km`;
}
