// Trip data. Data model: Trip -> Stops -> Photos.
// - A Trip has a name, date range (ISO), and ordered Stops (lat/lng/place).
// - Photos attach to a trip and reference a stop index; `showcase: true` marks
//   the ones the ambient loop shows. Pins derive from Stops.
// - Multi-stop trips are supported by the model (v0.1 sample data is single-stop;
//   later versions draw dotted routes between stops).
// - Wishlist entries are standalone pins with no photos, rendered hollow.
// Photos live in photos/<trip-slug>/.
window.TRIPS = [
  {
    slug: 'kyoto-2019',
    name: 'Cherry Blossoms in Kyoto',
    startDate: '2019-04-02',
    endDate: '2019-04-11',
    stops: [
      { order: 0, place: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
    ],
    photos: [
      { file: '01.svg', stop: 0, showcase: true },
      { file: '02.svg', stop: 0, showcase: true },
      { file: '03.svg', stop: 0, showcase: true },
      { file: '04.svg', stop: 0, showcase: true },
    ],
  },
  {
    slug: 'marrakech-2021',
    name: 'Marrakech & the Atlas Foothills',
    startDate: '2021-10-14',
    endDate: '2021-10-22',
    stops: [
      { order: 0, place: 'Marrakech, Morocco', lat: 31.6295, lng: -7.9811 },
    ],
    photos: [
      { file: '01.svg', stop: 0, showcase: true },
      { file: '02.svg', stop: 0, showcase: true },
      { file: '03.svg', stop: 0, showcase: true },
      { file: '04.svg', stop: 0, showcase: true },
    ],
  },
  {
    slug: 'lisbon-2022',
    name: 'Spring in Lisbon',
    startDate: '2022-05-06',
    endDate: '2022-05-14',
    stops: [
      { order: 0, place: 'Lisbon, Portugal', lat: 38.7223, lng: -9.1393 },
    ],
    photos: [
      { file: '01.svg', stop: 0, showcase: true },
      { file: '02.svg', stop: 0, showcase: true },
      { file: '03.svg', stop: 0, showcase: true },
      { file: '04.svg', stop: 0, showcase: true },
    ],
  },
  {
    slug: 'queenstown-2023',
    name: 'Southern Alps Roadtrip',
    startDate: '2023-02-18',
    endDate: '2023-03-01',
    stops: [
      { order: 0, place: 'Queenstown, New Zealand', lat: -45.0312, lng: 168.6626 },
    ],
    photos: [
      { file: '01.svg', stop: 0, showcase: true },
      { file: '02.svg', stop: 0, showcase: true },
      { file: '03.svg', stop: 0, showcase: true },
      { file: '04.svg', stop: 0, showcase: true },
    ],
  },
];

window.WISHLIST = [
  { place: 'Patagonia, Argentina', lat: -49.3315, lng: -72.8863 },
  { place: 'Reykjavík, Iceland', lat: 64.1466, lng: -21.9426 },
  { place: 'Bora Bora, French Polynesia', lat: -16.5004, lng: -151.7415 },
];
