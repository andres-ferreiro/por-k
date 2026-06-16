const GEOCODE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!GEOCODE_API_KEY) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GEOCODE_API_KEY}&language=es&region=MX`,
    );
    const json = await res.json();
    if (json.status === "OK" && json.results?.length > 0) {
      return (json.results[0].formatted_address as string) ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function captureCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}
