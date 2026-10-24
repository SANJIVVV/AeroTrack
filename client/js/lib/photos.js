/**
 * Photography from Unsplash (https://unsplash.com/license). Each photo's page
 * was checked on 2026-10-21 and showed "Free to use under the Unsplash
 * License" (not Unsplash+). Attribution is not required by the licence but is
 * given in IMAGE_ATTRIBUTIONS.md and on the pages that show the photos.
 *
 * Airline photos show that airline's aircraft according to the photo's own
 * Unsplash title/description. Where no such photo could be found and checked,
 * the airline card uses a generic airliner photo labelled "Illustrative photo".
 * No airline logos are bundled; brand marks are plain text.
 *
 * Images load from the Unsplash CDN at runtime; if they cannot load (offline,
 * blocked network) the UI falls back to a gradient.
 */
export const PHOTOS = {
  hero: { id: 'photo-1436491865332-7a61a109cc05', title: 'Above the clouds', alt: 'Airliner wing over a sea of clouds at sunrise', photographer: 'Ross Parmly', category: 'Aircraft', page: 'https://unsplash.com/@rparmly' },
  climbDusk: { id: 'photo-1751412038684-2eeca53b06b6', title: 'Climbing out at dusk', alt: 'A passenger jet climbing into the evening sky after take-off', photographer: 'Reid Zura', category: 'Runway', page: 'https://unsplash.com/@reidzura' },
  gateWindow: { id: 'photo-1758531491352-7887c1fe45b3', title: 'At the gate', alt: 'Airliner parked at an airport gate, seen through the terminal window', photographer: 'D YQ', category: 'Airport', page: 'https://unsplash.com/@18180604860d' },
  terminal: { id: 'photo-1499699862610-16bb305407c0', title: 'Departure hall', alt: 'Wide view of a bright airport departure hall interior', photographer: 'CHUTTERSNAP', category: 'Airport', page: 'https://unsplash.com/@chuttersnap' },
  departures: { id: 'photo-1767710096520-9246565a9d31', title: 'Travellers in the terminal', alt: 'Passengers with luggage walking through a modern airport terminal', photographer: 'CK Chen', category: 'Airport', page: 'https://unsplash.com/' },
  runwaySunset: { id: 'photo-1683971336619-d445cbec0276', title: 'Runway at sunset', alt: 'Aerial view of an airport runway at sunset', photographer: 'Niklas Jonasson', category: 'Runway', page: 'https://unsplash.com/' },
  conveyor: { id: 'photo-1762965119363-af950b523dca', title: 'Baggage reclaim', alt: 'Suitcases moving on a conveyor belt at an airport baggage claim', photographer: 'Alexander Schimmeck', category: 'Baggage', page: 'https://unsplash.com/' },
  reclaimHall: { id: 'photo-1763390760442-bd0969ebf14e', title: 'Reclaim hall', alt: 'Empty airport baggage claim area with conveyor belts', photographer: 'Alexander Schimmeck', category: 'Baggage', page: 'https://unsplash.com/' },
  checkIn: { id: 'photo-1652874457719-b48e0d7af327', title: 'Check-in counters', alt: 'A row of electronic check-in counters at an airport', photographer: 'Edwin Petrus', category: 'Airport', page: 'https://unsplash.com/@ep_petrus' },
  engine: { id: 'photo-1540575861501-7cf05a4b125a', title: 'Turbofan', alt: 'Close-up of an airliner turbofan engine in black and white', photographer: 'Luka Slapnicar', category: 'Detail', page: 'https://unsplash.com/' },
  wingClouds: { id: 'photo-1593182440709-4b7b56482c55', title: 'Wing over clouds', alt: 'Airliner wing above white clouds in daylight', photographer: 'Johny Goerend', category: 'Detail', page: 'https://unsplash.com/' },
  ramp: { id: 'photo-1759706000998-b09cded2de5a', title: 'Baggage on the ramp', alt: 'Airport tarmac with baggage carts beside a parked airliner', photographer: 'Anthony Maw', category: 'Baggage', page: 'https://unsplash.com/' },
  landing: { id: 'photo-1556388158-158ea5ccacbd', title: 'Final approach', alt: 'Commercial airliner landing on a runway', photographer: 'Pascal Meier', category: 'Runway', page: 'https://unsplash.com/' },
  takeoffNight: { id: 'photo-1520437358207-323b43b50729', title: 'Night departure', alt: 'Passenger airliner taking off at night with landing lights on', photographer: 'Josué Isaí Ramos Figueroa', category: 'Runway', page: 'https://unsplash.com/' },
  nightTarmac: { id: 'photo-1629221731259-4f0760e3ee89', title: 'Night stand', alt: 'White airliner on an airport apron at night', photographer: 'Mario Scheibl', category: 'Aircraft', page: 'https://unsplash.com/' },
  tarmacJet: { id: 'photo-1644553787502-406ae8e2c8ed', title: 'On the apron', alt: 'Large jetliner standing on an airport apron', photographer: 'Josh Withers', category: 'Aircraft', page: 'https://unsplash.com/' },
  jetTarmac2: { id: 'photo-1697976890319-3658d56a91bb', title: 'Wide-body at rest', alt: 'Wide-body jetliner parked on the tarmac', photographer: 'Declan Sun', category: 'Aircraft', page: 'https://unsplash.com/' },
  whitePlane: { id: 'photo-1572198404182-2c115d89fb26', title: 'Taxiing', alt: 'White passenger aircraft on an airport taxiway', photographer: 'Merve Sensoy', category: 'Aircraft', page: 'https://unsplash.com/' },
  grayPlane: { id: 'photo-1542296332-2e4473faf563', title: 'Parked', alt: 'Airliner parked at an airport stand', photographer: 'Rocker Sta', category: 'Aircraft', page: 'https://unsplash.com/' },
  goldenHour: { id: 'photo-1506012787146-f92b2d7d6d96', title: 'Golden hour', alt: 'Airliner flying in a golden-hour sky', photographer: 'Nils Nedel', category: 'Aircraft', page: 'https://unsplash.com/' },
  // Airline-specific photos (checked individually, see header).
  airIndia: { id: 'photo-1743636923208-7bc582593be0', title: 'Air India at the gate', alt: 'Air India airliner parked at a gate at Mumbai airport with ground equipment alongside', photographer: 'Zoshua Colah', category: 'Airline', page: 'https://unsplash.com/photos/air-india-plane-at-the-airport-terminal-912kEJlWABI' },
  indigo: { id: 'photo-1788362314352-40f7cb124b01', title: 'IndiGo on the apron', alt: 'IndiGo passenger aircraft parked on the apron at Mumbai airport under a clear sky', photographer: 'Zoshua Colah', category: 'Airline', page: 'https://unsplash.com/photos/indigo-airplanes-on-airport-tarmac-vUuyqY8r1dY' },
  akasa: { id: 'photo-1774411637160-eefc86727560', title: 'Akasa Air on approach', alt: 'Akasa Air passenger jet landing in low evening light', photographer: 'hemantha varma', category: 'Airline', page: 'https://unsplash.com/photos/akasa-air-jet-landing-at-airport-DUg3z7fJqts' },
  emirates: { id: 'photo-1560279329-f13dfb6b7244', title: 'Emirates on the runway', alt: 'White Emirates airliner on a runway under a cloudy sky', photographer: 'Waldemar Brandt', category: 'Airline', page: 'https://unsplash.com/photos/white-emirates-plane-on-runway-under-cloudy-sky-1aMtDyEzUZY' },
  qatar: { id: 'photo-1767868278862-36458c580c91', title: 'Qatar Airways on the tarmac', alt: 'Qatar Airways airliner standing on the tarmac', photographer: 'Sevcan Alkan', category: 'Airline', page: 'https://unsplash.com/photos/a-qatar-airways-airplane-on-the-tarmac-ZJIDILVKKRk' },
  etihad: { id: 'photo-1777897160493-0a5bc77c0c34', title: 'Etihad at Sydney', alt: 'Etihad Airways airliner on the runway at Sydney Airport under a clear sky', photographer: 'Peaky_82', category: 'Airline', page: 'https://unsplash.com/photos/an-etihad-airplane-on-the-runway-under-a-clear-sky-MnMkbD7c5Gw' },
  turkish: { id: 'photo-1750626706547-6de7b566fcdb', title: 'Turkish Airlines in flight', alt: 'Turkish Airlines airliner flying across the sky', photographer: 'Sevcan Alkan', category: 'Airline', page: 'https://unsplash.com/photos/turkish-airlines-plane-soars-in-the-sky-siw-UK8FFiU' },
  singapore: { id: 'photo-1577326079127-066da1bdae6a', title: 'Singapore Airlines A380', alt: 'Singapore Airlines Airbus A380 landing at Sydney Airport', photographer: 'Troy Mortier', category: 'Airline', page: 'https://unsplash.com/photos/singapore-airliner-vQdyIjWmvLk' },
  malaysia: { id: 'photo-1787012818542-3a6ee576234a', title: 'Malaysia Airlines climbing', alt: 'Malaysia Airlines passenger jet climbing into a clear blue sky at Sydney', photographer: 'David Syphers', category: 'Airline', page: 'https://unsplash.com/photos/malaysia-airlines-jet-climbing-skyward-CPuAa4BFzis' },
  thai: { id: 'photo-1786549916472-f9552ce1659c', title: 'Thai Airways departing', alt: 'Thai Airways passenger jet taking off past the control tower at Amsterdam Schiphol', photographer: 'Stroopsniper Lenn', category: 'Airline', page: 'https://unsplash.com/photos/thai-airways-jet-taking-off-vemt1oNMyQg' },
  cathay: { id: 'photo-1698761326553-7bdf872d8771', title: 'Cathay Pacific on the runway', alt: 'Cathay Pacific airliner on the runway at Vancouver', photographer: 'Isaac Struna', category: 'Airline', page: 'https://unsplash.com/photos/a-cathay-pacific-airplane-on-the-runway-du0NJ2N1WX4' },
  jal: { id: 'photo-1713763183588-dcce66c17be4', title: 'Japan Airlines at Haneda', alt: 'Japan Airlines airliner on a runway beside the water at Tokyo Haneda', photographer: 'Ryuno', category: 'Airline', page: 'https://unsplash.com/photos/a-japan-airlines-plane-on-a-runway-near-the-water-N-2AwwtfpgA' },
  ana: { id: 'photo-1741611123359-62169d4dae77', title: 'ANA Boeing 787', alt: 'ANA Boeing 787 airborne', photographer: 'Jeff Wen', category: 'Airline', page: 'https://unsplash.com/photos/an-ana-boeing-787-is-airborne-M9iWYDbBQ6E' },
  lufthansa: { id: 'photo-1787258463786-e5233b3dbe4d', title: 'Boarding Lufthansa', alt: 'Passengers boarding a Lufthansa airliner at Munich Airport', photographer: 'Zoshua Colah', category: 'Airline', page: 'https://unsplash.com/photos/passengers-boarding-lufthansa-airplane-at-airport-Co_tL7Q3__I' },
  britishAirways: { id: 'photo-1744451620884-630219cbf017', title: 'British Airways take-off', alt: 'British Airways airliner taking off into the sky over London', photographer: 'Samuel Hagger', category: 'Airline', page: 'https://unsplash.com/photos/a-british-airways-plane-takes-off-into-the-sky-BeP1qe48WHE' },
  airFrance: { id: 'photo-1559711469-3395fc1dadb3', title: 'Air France at Orly', alt: 'White Air France airliner at Paris Orly Airport', photographer: 'Daniel Eledut', category: 'Airline', page: 'https://unsplash.com/photos/white-airfrance-airliner-qfPuby0S040' },
  airAsia: { id: 'photo-1577330608647-d0959a2188c0', title: 'AirAsia over Sydney', alt: 'White and red AirAsia passenger plane flying over Sydney', photographer: 'Troy Mortier', category: 'Airline', page: 'https://unsplash.com/photos/white-and-red-air-asia-passenger-plane-above-ikea-building-during-daytime-Px2JA5NomvI' },
  qantas: { id: 'photo-1752901814805-e074a23559f6', title: 'Qantas Freight at Sydney', alt: 'Qantas Freight aircraft on the runway at Sydney Airport', photographer: 'David Syphers', category: 'Airline', page: 'https://unsplash.com/photos/a-qantas-freight-plane-is-on-the-runway-oOF__YZVwHk' },
};

export const photoUrl = (key, width = 1600) => {
  const p = PHOTOS[key];
  return p ? `https://images.unsplash.com/${p.id}?auto=format&fit=crop&w=${width}&q=70` : '';
};

export const photo = (key) => PHOTOS[key];
