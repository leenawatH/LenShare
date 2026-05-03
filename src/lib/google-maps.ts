let loadPromise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    google?: typeof google;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps loader called on server"));
  }
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ใน .env.local"),
    );
  }

  if (window.google?.maps?.places) {
    loadPromise = Promise.resolve(window.google);
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const cbName = `__gm_init_${Math.random().toString(36).slice(2)}`;
    (window as unknown as Record<string, unknown>)[cbName] = () => {
      delete (window as unknown as Record<string, unknown>)[cbName];
      if (window.google) resolve(window.google);
      else reject(new Error("Google Maps loaded but window.google missing"));
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      libraries: "places",
      language: "th",
      region: "TH",
      callback: cbName,
      loading: "async",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("โหลด Google Maps ไม่สำเร็จ — ตรวจ API key / billing"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
