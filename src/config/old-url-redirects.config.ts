export type OldUrlRedirect = {
  source: string;
  destination: string;
  permanent: boolean;
  note: string;
};

export const oldUrlRedirects: OldUrlRedirect[] = [
  { source: "/read/65/toys", destination: "/toys", permanent: true, note: "Legacy Toys department." },
  { source: "/read/47/party-supplies", destination: "/party-supplies", permanent: true, note: "Legacy Party Supplies department." },
  { source: "/read/48/stationery", destination: "/stationery", permanent: true, note: "Legacy Stationery department." },
  { source: "/read/49/arts-crafts", destination: "/arts-and-crafts", permanent: true, note: "Legacy Arts & Crafts department." },
  { source: "/read/50/greeting-cards", destination: "/greeting-cards", permanent: true, note: "Legacy Greeting Cards department." },
  { source: "/read/63/balloons", destination: "/balloons", permanent: true, note: "Legacy Balloons department." },
  { source: "/read/51/gifts", destination: "/gifts", permanent: true, note: "Legacy Gifts department." },
  { source: "/read/58/seasonal-specials", destination: "/holidays", permanent: true, note: "Legacy Seasonal Specials maps to editable Holidays." },
  { source: "/read/52/candy-candy-candy", destination: "/shop", permanent: true, note: "Candy & Snacks is not a main department." },
  { source: "/read/20/modern-state-news-store-locations-in-upper-east-side-nyc", destination: "/locations", permanent: true, note: "Legacy locations page." },
  { source: "/read/59/store-on-3rd-avenue", destination: "/locations/3rd-avenue", permanent: true, note: "Legacy 3rd Avenue location page." },
  { source: "/read/60/store-on-86th-street", destination: "/locations/86th-street", permanent: true, note: "Legacy 86th Street location page." },
  { source: "/read/19/a-modern-state-news", destination: "/about", permanent: true, note: "Legacy brand history page." },
  { source: "/read/64/email-signup", destination: "/contact#newsletter", permanent: true, note: "Legacy email signup page." }
];
