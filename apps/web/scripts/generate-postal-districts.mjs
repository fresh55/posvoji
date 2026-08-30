// Downloads the GURS postal-district register and turns it into the postcode
// -> coordinate table lib/postal-lookup.ts searches. Run once; the output is
// committed, the network fetch is not part of the build.
import { writeFileSync } from "node:fs";
import proj4 from "proj4";
import { readRemoteText } from "./remote-source.mjs";

const SRC = process.argv[2] ?? "https://raw.githubusercontent.com/stefanb/gurs-rpe/master/data/PT.csv";
const OUT = process.argv[3] ?? new URL("../lib/postal-districts.ts", import.meta.url);

// EPSG:3794, the Slovene national grid (D96/TM) the register's CEN_E/CEN_N
// centroids are given in.
const D96_TM =
  "+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9999 +x_0=500000 +y_0=-5000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
const toWgs84 = proj4(D96_TM, "WGS84");
const MAX_CSV_BYTES = 8 * 1024 * 1024;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((key, i) => {
      row[key] = cells[i];
    });
    return row;
  });
}

const rows = parseCsv(
  await readRemoteText(SRC, {
    accept: "text/csv,text/plain;q=0.9",
    maxBytes: MAX_CSV_BYTES,
    label: "GURS postal districts CSV",
  }),
);

const districts = rows
  .map((row) => {
    const [lon, lat] = toWgs84.forward([Number(row.CEN_E), Number(row.CEN_N)]);
    return {
      code: row.PT_ID.padStart(4, "0"),
      name: row.PT_UIME,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

const body = districts
  .map(
    (d) =>
      `  { code: ${JSON.stringify(d.code)}, name: ${JSON.stringify(d.name)}, lat: ${d.lat}, lon: ${d.lon} },`,
  )
  .join("\n");

writeFileSync(
  OUT,
  `// GENERATED FILE. Do not edit by hand.
//
// Slovenian postal districts (poštni okoliši), from the Register of Spatial
// Units published by the Surveying and Mapping Authority of the Republic of
// Slovenia (GURS), via github.com/stefanb/gurs-rpe (data/PT.csv). Licensed
// CC BY 4.0.
//
// Rebuild with: pnpm --filter web generate:postal-districts

export type PostalDistrict = {
  code: string;
  name: string;
  lat: number;
  lon: number;
};

export const POSTAL_DISTRICTS: PostalDistrict[] = [
${body}
];
`,
);

console.log(`districts=${districts.length}`);
