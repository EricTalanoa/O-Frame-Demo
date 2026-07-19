// Hand-authored trip data. Data model: Trip -> Stops -> Photos.
// - A Trip has a name, date range (ISO), and ordered Stops (lat/lng/place).
// - Photos attach to a trip and reference a stop index; `showcase: true` marks
//   the ones the ambient loop shows. Pins derive from Stops.
// - Multi-stop trips are supported by the model (later versions draw dotted
//   routes between stops).
// - Photos live in photos/<trip-slug>/.
//
// Most trips are added from the phone (http://<host>:3000/upload) and live in
// data/uploaded-trips.js, which the server keeps in sync — commit that file
// plus photos/ to save them. This file is for anything you'd rather write by
// hand.
window.TRIPS = [];

// Wishlist: standalone pins with no photos, rendered hollow.
window.WISHLIST = [
  { place: 'Patagonia, Argentina', lat: -49.3315, lng: -72.8863 },
  { place: 'Reykjavík, Iceland', lat: 64.1466, lng: -21.9426 },
  { place: 'Bora Bora, French Polynesia', lat: -16.5004, lng: -151.7415 },
];
