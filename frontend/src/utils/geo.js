import { isNativeApp } from '../native/platform';

export async function readPosition() {
  if (isNativeApp()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  }
  if (!navigator.geolocation) {
    const error = new Error('location');
    error.code = 'LOCATION_REQUIRED';
    throw error;
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      () => {
        const error = new Error('location');
        error.code = 'LOCATION_REQUIRED';
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}
