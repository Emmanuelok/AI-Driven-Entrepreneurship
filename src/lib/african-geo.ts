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

  // Ventures (green)
  { id: "v-kubacold", name: "KubaCold", country: "Ghana", lng: -0.85, lat: 9.41, type: "venture", meta: "Solar cold chain", hot: 4 },
  { id: "v-triagegpt", name: "TriageGPT", country: "Nigeria", lng: 3.4, lat: 6.5, type: "venture", meta: "CHW co-pilot", hot: 3 },
  { id: "v-kivipay", name: "KiviPay", country: "Kenya", lng: 36.82, lat: -1.29, type: "venture", meta: "Cross-border payments", hot: 4 },
  { id: "v-sahelwx", name: "SahelWeather", country: "Burkina Faso", lng: -1.53, lat: 12.37, type: "venture", meta: "Climate voice notes", hot: 3 },
  { id: "v-koeso", name: "Koeso", country: "Senegal", lng: -17.47, lat: 14.72, type: "venture", meta: "Fishery telematics", hot: 3 },
  { id: "v-ndizi", name: "Ndizi Cloud", country: "Tanzania", lng: 39.27, lat: -6.82, type: "venture", meta: "Banana cold logistics", hot: 3 },

  // Mentors (amber)
  { id: "m-ia", name: "Iyinoluwa Aboyeji", country: "Nigeria", lng: 3.42, lat: 6.49, type: "mentor", meta: "Future Africa", hot: 5 },
  { id: "m-re", name: "Rebecca Enonchong", country: "Cameroon", lng: 9.7, lat: 4.05, type: "mentor", meta: "AppsTech", hot: 5 },
  { id: "m-hs", name: "Ham Serunjogi", country: "Uganda", lng: 32.58, lat: 0.34, type: "mentor", meta: "Chipper Cash", hot: 5 },
  { id: "m-ka", name: "Kola Aina", country: "Nigeria", lng: 3.41, lat: 6.48, type: "mentor", meta: "Ventures Platform", hot: 5 },
  { id: "m-sa", name: "Shola Akinlade", country: "Nigeria", lng: 3.39, lat: 6.46, type: "mentor", meta: "Paystack", hot: 5 },
  { id: "m-rmt", name: "Rose Mutiso", country: "Kenya", lng: 36.83, lat: -1.3, type: "mentor", meta: "Energy for Growth", hot: 4 },
  { id: "m-ace", name: "Audrey Cheng", country: "Kenya", lng: 36.81, lat: -1.28, type: "mentor", meta: "Moringa School", hot: 4 },
  { id: "m-afb", name: "Ange Frederick", country: "Côte d'Ivoire", lng: -4.02, lat: 5.36, type: "mentor", meta: "LifeBank CI", hot: 4 },

  // Cohorts (indigo)
  { id: "c-knust", name: "KNUST cohort W24", country: "Ghana", lng: -1.57, lat: 6.68, type: "cohort", meta: "671 learners", hot: 4 },
  { id: "c-unilag", name: "UNILAG cohort", country: "Nigeria", lng: 3.4, lat: 6.52, type: "cohort", meta: "1,204 learners", hot: 5 },
  { id: "c-uonbi", name: "UoN cohort", country: "Kenya", lng: 36.82, lat: -1.28, type: "cohort", meta: "892 learners", hot: 4 },
  { id: "c-wits", name: "Wits cohort", country: "South Africa", lng: 28.03, lat: -26.19, type: "cohort", meta: "445 learners", hot: 3 },
  { id: "c-makerere", name: "Makerere cohort", country: "Uganda", lng: 32.57, lat: 0.33, type: "cohort", meta: "312 learners", hot: 3 },
  { id: "c-asesa", name: "Ashesi cohort", country: "Ghana", lng: -0.21, lat: 5.76, type: "cohort", meta: "248 learners", hot: 3 },
];

// project lat/lng to 0-1000 viewport coords (rough equirectangular for Africa)
// Africa bounding box: lng -18..52, lat 38..-35
export function project(lng: number, lat: number, width = 1000, height = 1100) {
  const x = ((lng + 18) / 70) * width;
  const y = ((38 - lat) / 73) * height;
  return { x, y };
}
