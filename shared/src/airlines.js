/**
 * Demonstration airline directory. This is an editable list for the academic
 * project, not a claim of partnership or integration with any airline.
 * Brand marks are rendered as plain text (IATA code), never as logos.
 */
export const AIRLINE_REGIONS = ['South Asia', 'Middle East', 'Southeast Asia', 'East Asia', 'Europe', 'Oceania'];

/**
 * Brands that no longer fly independently. Shown as a note in the directory
 * instead of being listed as active airlines.
 */
export const HISTORICAL_BRANDS = [
  {
    name: 'Vistara',
    code: 'UK',
    note: 'Tata SIA Airlines (Vistara) merged into Air India on 12 November 2024 and no longer operates as a separate airline. Air India Express is listed in its place.',
  },
];

const f = (number, origin, destination) => ({ number, origin, destination });

export const AIRLINE_DIRECTORY = [
  {
    code: 'AI',
    name: 'Air India',
    country: 'India',
    region: 'South Asia',
    hub: 'DEL',
    description: "India's flag carrier, part of the Tata Group, flying domestic and long-haul international routes.",
    officialSite: 'https://www.airindia.com/',
    image: 'airIndia',
    photoMatchesAirline: true,
    featured: f('573', 'MAA', 'BOM'),
    sampleRoutes: ['MAA', 'BOM', 'LHR'],
  },
  {
    code: 'IX',
    name: 'Air India Express',
    country: 'India',
    region: 'South Asia',
    hub: 'COK',
    description: 'Low-cost airline in the Air India group, serving domestic routes and the Gulf.',
    officialSite: 'https://www.airindiaexpress.com/',
    image: 'whitePlane',
    photoMatchesAirline: false,
    featured: f('1641', 'COK', 'DXB'),
    sampleRoutes: ['DXB', 'MAA', 'BLR'],
  },
  {
    code: '6E',
    name: 'IndiGo',
    country: 'India',
    region: 'South Asia',
    hub: 'DEL',
    description: "India's largest airline by passengers, known for a dense low-cost domestic network.",
    officialSite: 'https://www.goindigo.in/',
    image: 'indigo',
    photoMatchesAirline: true,
    featured: f('6245', 'BLR', 'DEL'),
    sampleRoutes: ['MAA', 'BLR', 'CJB'],
  },
  {
    code: 'QP',
    name: 'Akasa Air',
    country: 'India',
    region: 'South Asia',
    hub: 'BOM',
    description: 'Indian low-cost carrier that began commercial flights in 2022.',
    officialSite: 'https://www.akasaair.com/',
    image: 'akasa',
    photoMatchesAirline: true,
    featured: f('1350', 'BLR', 'HYD'),
    sampleRoutes: ['MAA', 'BLR', 'DEL'],
  },
  {
    code: 'SG',
    name: 'SpiceJet',
    country: 'India',
    region: 'South Asia',
    hub: 'DEL',
    description: 'Indian low-cost airline operating domestic and regional international flights.',
    officialSite: 'https://www.spicejet.com/',
    image: 'landing',
    photoMatchesAirline: false,
    featured: f('8169', 'DEL', 'BOM'),
    sampleRoutes: ['MAA', 'HYD', 'BOM'],
  },
  {
    code: 'EK',
    name: 'Emirates',
    country: 'United Arab Emirates',
    region: 'Middle East',
    hub: 'DXB',
    description: 'Dubai-based airline and one of the largest long-haul operators in the world.',
    officialSite: 'https://www.emirates.com/',
    image: 'emirates',
    photoMatchesAirline: true,
    featured: f('542', 'MAA', 'DXB'),
    sampleRoutes: ['MAA', 'LHR', 'SIN'],
  },
  {
    code: 'QR',
    name: 'Qatar Airways',
    country: 'Qatar',
    region: 'Middle East',
    hub: 'DOH',
    description: 'Flag carrier of Qatar, connecting through Hamad International Airport in Doha.',
    officialSite: 'https://www.qatarairways.com/',
    image: 'qatar',
    photoMatchesAirline: true,
    featured: f('528', 'MAA', 'DOH'),
    sampleRoutes: ['MAA', 'CDG', 'SYD'],
  },
  {
    code: 'EY',
    name: 'Etihad Airways',
    country: 'United Arab Emirates',
    region: 'Middle East',
    hub: 'AUH',
    description: 'Abu Dhabi-based national airline of the United Arab Emirates.',
    officialSite: 'https://www.etihad.com/',
    image: 'etihad',
    photoMatchesAirline: true,
    featured: f('269', 'MAA', 'AUH'),
    sampleRoutes: ['MAA', 'LHR', 'BKK'],
  },
  {
    code: 'TK',
    name: 'Turkish Airlines',
    country: 'Türkiye',
    region: 'Europe',
    hub: 'IST',
    description: 'Flag carrier of Türkiye, flying to more countries than almost any other airline.',
    officialSite: 'https://www.turkishairlines.com/',
    image: 'turkish',
    photoMatchesAirline: true,
    featured: f('717', 'DEL', 'IST'),
    sampleRoutes: ['DEL', 'FRA', 'DXB'],
  },
  {
    code: 'SQ',
    name: 'Singapore Airlines',
    country: 'Singapore',
    region: 'Southeast Asia',
    hub: 'SIN',
    description: 'Flag carrier of Singapore, based at Changi Airport.',
    officialSite: 'https://www.singaporeair.com/',
    image: 'singapore',
    photoMatchesAirline: true,
    featured: f('529', 'MAA', 'SIN'),
    sampleRoutes: ['MAA', 'SYD', 'NRT'],
  },
  {
    code: 'MH',
    name: 'Malaysia Airlines',
    country: 'Malaysia',
    region: 'Southeast Asia',
    hub: 'KUL',
    description: 'Flag carrier of Malaysia, based at Kuala Lumpur International Airport.',
    officialSite: 'https://www.malaysiaairlines.com/',
    image: 'malaysia',
    photoMatchesAirline: true,
    featured: f('181', 'MAA', 'KUL'),
    sampleRoutes: ['MAA', 'SIN', 'BKK'],
  },
  {
    code: 'TG',
    name: 'Thai Airways',
    country: 'Thailand',
    region: 'Southeast Asia',
    hub: 'BKK',
    description: 'Flag carrier of Thailand, based at Bangkok Suvarnabhumi Airport.',
    officialSite: 'https://www.thaiairways.com/',
    image: 'thai',
    photoMatchesAirline: true,
    featured: f('338', 'DEL', 'BKK'),
    sampleRoutes: ['DEL', 'HKG', 'NRT'],
  },
  {
    code: 'CX',
    name: 'Cathay Pacific',
    country: 'Hong Kong',
    region: 'East Asia',
    hub: 'HKG',
    description: "Hong Kong's home carrier, linking Asia with long-haul destinations.",
    officialSite: 'https://www.cathaypacific.com/',
    image: 'cathay',
    photoMatchesAirline: true,
    featured: f('694', 'DEL', 'HKG'),
    sampleRoutes: ['DEL', 'SYD', 'LHR'],
  },
  {
    code: 'JL',
    name: 'Japan Airlines',
    country: 'Japan',
    region: 'East Asia',
    hub: 'HND',
    description: "Japan's flag carrier, operating from Tokyo Haneda and Narita.",
    officialSite: 'https://www.jal.com/',
    image: 'jal',
    photoMatchesAirline: true,
    featured: f('740', 'DEL', 'HND'),
    sampleRoutes: ['DEL', 'SIN', 'HKG'],
  },
  {
    code: 'NH',
    name: 'ANA',
    country: 'Japan',
    region: 'East Asia',
    hub: 'NRT',
    description: "All Nippon Airways, Japan's largest airline.",
    officialSite: 'https://www.ana.co.jp/',
    image: 'ana',
    photoMatchesAirline: true,
    featured: f('830', 'BOM', 'NRT'),
    sampleRoutes: ['BOM', 'SIN', 'FRA'],
  },
  {
    code: 'LH',
    name: 'Lufthansa',
    country: 'Germany',
    region: 'Europe',
    hub: 'FRA',
    description: "Germany's flag carrier, with major hubs in Frankfurt and Munich.",
    officialSite: 'https://www.lufthansa.com/',
    image: 'lufthansa',
    photoMatchesAirline: true,
    featured: f('759', 'MAA', 'FRA'),
    sampleRoutes: ['MAA', 'BOM', 'IST'],
  },
  {
    code: 'BA',
    name: 'British Airways',
    country: 'United Kingdom',
    region: 'Europe',
    hub: 'LHR',
    description: 'Flag carrier of the United Kingdom, based at London Heathrow.',
    officialSite: 'https://www.britishairways.com/',
    image: 'britishAirways',
    photoMatchesAirline: true,
    featured: f('36', 'MAA', 'LHR'),
    sampleRoutes: ['DEL', 'BLR', 'DXB'],
  },
  {
    code: 'AF',
    name: 'Air France',
    country: 'France',
    region: 'Europe',
    hub: 'CDG',
    description: "France's flag carrier, based at Paris Charles de Gaulle.",
    officialSite: 'https://www.airfrance.com/',
    image: 'airFrance',
    photoMatchesAirline: true,
    featured: f('217', 'BOM', 'CDG'),
    sampleRoutes: ['DEL', 'BOM', 'AMS'],
  },
  {
    code: 'AK',
    name: 'AirAsia',
    country: 'Malaysia',
    region: 'Southeast Asia',
    hub: 'KUL',
    description: 'Low-cost airline group based in Kuala Lumpur, flying widely across Asia.',
    officialSite: 'https://www.airasia.com/',
    image: 'airAsia',
    photoMatchesAirline: true,
    featured: f('12', 'KUL', 'MAA'),
    sampleRoutes: ['MAA', 'BKK', 'SIN'],
  },
  {
    code: 'QF',
    name: 'Qantas',
    country: 'Australia',
    region: 'Oceania',
    hub: 'SYD',
    description: "Australia's flag carrier, founded in 1920.",
    officialSite: 'https://www.qantas.com/',
    image: 'qantas',
    photoMatchesAirline: true,
    featured: f('68', 'BLR', 'SYD'),
    sampleRoutes: ['SIN', 'BLR', 'HND'],
  },
];

export function findAirline(code) {
  const c = code.toUpperCase();
  return AIRLINE_DIRECTORY.find((a) => a.code === c);
}

/** Rough block times in hours, only to make sample schedules look plausible. */
function blockHours(a, b) {
  const domestic = ['DEL', 'BOM', 'MAA', 'BLR', 'HYD', 'CJB', 'COK'];
  if (domestic.includes(a) && domestic.includes(b)) return 2.25;
  const near = ['DXB', 'AUH', 'DOH', 'SIN', 'KUL', 'BKK'];
  if (domestic.includes(a) || domestic.includes(b)) return near.includes(a) || near.includes(b) ? 4.25 : 9.5;
  return 7;
}

/** Status implied by the sample timetable. Some future flights are marked delayed for the demo. */
function sampleStatus(dep, arr, now, seed) {
  const t = now.getTime();
  if (arr.getTime() <= t) return 'LANDED';
  if (dep.getTime() <= t) return t - dep.getTime() < 20 * 60_000 ? 'DEPARTED' : 'IN_AIR';
  if (seed % 7 === 3) return 'DELAYED';
  const mins = (dep.getTime() - t) / 60_000;
  if (mins <= 45) return 'BOARDING';
  if (mins <= 180) return 'CHECK_IN_OPEN';
  return 'SCHEDULED';
}

/**
 * Sample flights for the demonstration directory. These are NOT real
 * schedules: times are generated relative to `now`, gates and belts are
 * invented, and every record is stored with source 'demo' and isDemo=true.
 * Each airline gets its headline flight plus three routes in both directions
 * (route flight numbers use the 9xx range).
 */
export function sampleFlights(now = new Date()) {
  const slot = (hours) => new Date(Math.round((now.getTime() + hours * 3600_000) / 300_000) * 300_000);
  const out = [];
  const push = (a, number, origin, destination, dep, seed, featured) => {
    const arr = new Date(dep.getTime() + blockHours(origin, destination) * 3600_000);
    out.push({
      airlineCode: a.code,
      airlineName: a.name,
      flightNumber: `${a.code}${number}`,
      origin,
      destination,
      scheduledDeparture: dep,
      scheduledArrival: arr,
      status: sampleStatus(dep, arr, now, seed),
      gate: `${'ABCDE'[seed % 5]}${((seed * 7) % 28) + 1}`,
      baggageBelt: String(((seed * 5) % 12) + 1),
      featured,
    });
  };
  AIRLINE_DIRECTORY.forEach((a, ai) => {
    push(a, a.featured.number, a.featured.origin, a.featured.destination, slot(-1.5 + ((ai * 3) % 14) * 0.75), ai * 11 + 1, true);
    a.sampleRoutes.forEach((dest, ri) => {
      const outDep = slot(-3 + ((ai * 5 + ri * 7) % 26));
      const backDep = new Date(outDep.getTime() + blockHours(a.hub, dest) * 3600_000 + 90 * 60_000);
      push(a, `9${ai}${ri + 1}`, a.hub, dest, outDep, ai * 11 + ri + 2, false);
      push(a, `9${ai}${ri + 4}`, dest, a.hub, backDep, ai * 11 + ri + 5, false);
    });
  });
  return out;
}

/** Display form of a flight number, e.g. "AI573" -> "AI 573". */
export function formatFlightNumber(n) {
  return /^[A-Z0-9]{2}\d/.test(n) ? `${n.slice(0, 2)} ${n.slice(2)}` : n;
}
