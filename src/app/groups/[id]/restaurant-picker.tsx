"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

export type PickedPlace = {
  name: string | null;
  placeId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
};

export const EMPTY_PLACE: PickedPlace = {
  name: null,
  placeId: null,
  address: null,
  lat: null,
  lng: null,
  url: null,
};

export function RestaurantPicker({
  initialName,
  onChange,
}: {
  initialName: string;
  onChange: (place: PickedPlace) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !inputRef.current) return;
        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          types: ["restaurant", "cafe", "food"],
          fields: [
            "place_id",
            "name",
            "formatted_address",
            "geometry",
            "url",
          ],
          componentRestrictions: { country: "th" },
        });
        const listener = ac.addListener("place_changed", () => {
          const p = ac.getPlace();
          const name = p.name || inputRef.current?.value || "";
          setValue(name);
          const lat = p.geometry?.location?.lat();
          const lng = p.geometry?.location?.lng();
          onChangeRef.current({
            name: name || null,
            placeId: p.place_id ?? null,
            address: p.formatted_address ?? null,
            lat: typeof lat === "number" ? lat : null,
            lng: typeof lng === "number" ? lng : null,
            url:
              p.url ??
              (p.place_id
                ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
                : null),
          });
        });
        setReady(true);
        return () => listener.remove();
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          onChangeRef.current({ ...EMPTY_PLACE, name: v.trim() || null });
        }}
        placeholder={
          ready ? "ค้นหาร้านอาหาร เช่น สมบูรณ์โภชนา" : "กำลังโหลด Google Maps..."
        }
        className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
      />
      {error && (
        <p className="text-xs text-[hsl(var(--destructive))]">
          ⚠ {error} (กรอกชื่อร้านเองได้)
        </p>
      )}
      {!error && ready && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          พิมพ์เพื่อค้นหาร้าน → เลือกจากรายการเพื่อบันทึกตำแหน่ง
        </p>
      )}
    </div>
  );
}
