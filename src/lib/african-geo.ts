// Approximate centroid coordinates for major African cities + venture/problem hotspots.
// Used by the Atlas map. Projected to a simplified rectangle.

export type GeoPoint = {
  id: string;
  name: string;
  country: string;
  lng: number;
  lat: number;
  type: "problem" | "venture" | "mentor" | "cohort";
  meta?: string;
  hot?: number; // 1..5 intensity
};

export const HOTSPOTS: GeoPoint[] = [
  // Problems (red)
  { id: "p-tomato-tamale", name: "Post-harvest tomato loss", country: "Ghana", lng: -0.84, lat: 9.4, type: "problem", meta: "30-40% loss", hot: 5 },
  { id: "p-cassava-kogi", name: "Cassava mosaic disease", country: "Nigeria", lng: 6.74, lat: 7.8, type: "problem", meta: "11M smallholders", hot: 5 },
  { id: "p-sahel-rain", name: "Rainfall forecasting gap", country: "Burkina Faso", lng: -1.5, lat: 12.3, type: "problem", meta: "Sahel-wide", hot: 5 },
  { id: "p-mat-mortality-uganda", name: "Maternal mortality risk", country: "Uganda", lng: 32.6, lat: 1.37, type: "problem", meta: "375/100k", hot: 5 },
  { id: "p-water-malawi", name: "Borehole water safety", country: "Malawi", lng: 33.78, lat: -13.25, type: "problem", meta: "1.6M unsafe", hot: 4 },
  { id: "p-mobile-credit-kenya", name: "Invisible SME credit", country: "Kenya", lng: 36.82, lat: -1.29, type: "problem", meta: "$24B gap", hot: 4 },
  { id: "p-minigrid-drc", name: "Minigrid design speed", country: "DR Congo", lng: 23.66, lat: -2.88, type: "problem", meta: "76M unserved", hot: 5 },
  { id: "p-translation-eth", name: "Amharic legal access", country: "Ethiopia", lng: 38.74, lat: 9.03, type: "problem", meta: "70M speakers", hot: 4 },
  { id: "p-elearning-sa", name: "Rural broadband edu gap", country: "South Africa", lng: 28.04, lat: -26.2, type: "problem", meta: "12M learners", hot: 4 },
  { id: "p-fishery-senegal", name: "Overfishing visibility", country: "Senegal", lng: -17.45, lat: 14.7, type: "problem", meta: "600k livelihoods", hot: 4 },
  { id: "p-cocoa-civ", name: "Cocoa farmer poverty", country: "Côte d'Ivoire", lng: -5.55, lat: 7.55, type: "problem", meta: "1M+ farmers", hot: 5 },
  { id: "p-waste-cairo", name: "Urban waste-to-value", country: "Egypt", lng: 31.24, lat: 30.04, type: "problem", meta: "Cairo 22M", hot: 4 },

  // Ventures, mentors, and cohorts populate from real registrations:
  // a venture appears here when a founder publishes one publicly, a
  // mentor pin appears when someone signs up with the mentor account
  // type and sets their home base, and a cohort appears when an
  // instructor connects a real cohort. Until then the map shows just
  // the problem layer so visitors see the real surface area of work,
  // not a fabricated network of activity.
];

// project lat/lng to 0-1000 viewport coords (rough equirectangular for Africa)
// Africa bounding box: lng -18..52, lat 38..-35
export function project(lng: number, lat: number, width = 1000, height = 1100) {
  const x = ((lng + 18) / 70) * width;
  const y = ((38 - lat) / 73) * height;
  return { x, y };
}
