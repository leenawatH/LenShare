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

const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 };

export function RestaurantPicker({
  initialName,
  initialLat,
  initialLng,
  onChange,
}: {
  initialName: string;
  initialLat?: number | null;
  initialLng?: number | null;
  onChange: (place: PickedPlace) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(
    null,
  );
  const valueRef = useRef(initialName);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [searching, setSearching] = useState(false);

  valueRef.current = value;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapDivRef.current || !inputRef.current) return;

        const hasInitial =
          typeof initialLat === "number" && typeof initialLng === "number";
        const startCenter = hasInitial
          ? { lat: initialLat as number, lng: initialLng as number }
          : DEFAULT_CENTER;

        const map = new g.maps.Map(mapDivRef.current, {
          center: startCenter,
          zoom: hasInitial ? 16 : 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        const marker = new g.maps.Marker({
          map,
          position: startCenter,
          draggable: true,
          visible: hasInitial,
        });
        markerRef.current = marker;

        const placesService = new g.maps.places.PlacesService(map);
        placesServiceRef.current = placesService;

        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          types: ["restaurant"],
          fields: ["place_id", "name", "formatted_address", "geometry", "url"],
          componentRestrictions: { country: "th" },
        });
        ac.bindTo("bounds", map);

        const acListener = ac.addListener("place_changed", () => {
          const p = ac.getPlace();
          if (!p.geometry?.location) return;
          const loc = p.geometry.location;
          const name = p.name ?? inputRef.current?.value ?? "";
          setValue(name);
          marker.setPosition(loc);
          marker.setVisible(true);
          map.panTo(loc);
          map.setZoom(17);
          onChangeRef.current({
            name: name || null,
            placeId: p.place_id ?? null,
            address: p.formatted_address ?? null,
            lat: loc.lat(),
            lng: loc.lng(),
            url:
              p.url ??
              (p.place_id
                ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
                : null),
          });
        });

        const findNearestRestaurant = (pos: google.maps.LatLng) => {
          setSearching(true);
          placesService.nearbySearch(
            {
              location: pos,
              rankBy: g.maps.places.RankBy.DISTANCE,
              type: "restaurant",
            },
            (results, status) => {
              setSearching(false);
              const lat = pos.lat();
              const lng = pos.lng();
              if (
                status === g.maps.places.PlacesServiceStatus.OK &&
                results &&
                results.length > 0
              ) {
                const top = results[0];
                const name = top.name ?? "";
                setValue(name);
                onChangeRef.current({
                  name: name || null,
                  placeId: top.place_id ?? null,
                  address: top.vicinity ?? null,
                  lat,
                  lng,
                  url: top.place_id
                    ? `https://www.google.com/maps/place/?q=place_id:${top.place_id}`
                    : null,
                });
              } else {
                onChangeRef.current({
                  ...EMPTY_PLACE,
                  name: valueRef.current.trim() || null,
                  lat,
                  lng,
                });
              }
            },
          );
        };

        const dragListener = marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) findNearestRestaurant(pos);
        });

        const clickListener = map.addListener(
          "click",
          (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            marker.setPosition(e.latLng);
            marker.setVisible(true);
            findNearestRestaurant(e.latLng);
          },
        );

        setReady(true);
        return () => {
          acListener.remove();
          dragListener.remove();
          clickListener.remove();
        };
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation || !mapRef.current || !markerRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = new google.maps.LatLng(
          pos.coords.latitude,
          pos.coords.longitude,
        );
        mapRef.current!.panTo(ll);
        mapRef.current!.setZoom(17);
        markerRef.current!.setPosition(ll);
        markerRef.current!.setVisible(true);
        const svc = placesServiceRef.current;
        if (!svc) return;
        setSearching(true);
        svc.nearbySearch(
          {
            location: ll,
            rankBy: google.maps.places.RankBy.DISTANCE,
            type: "restaurant",
          },
          (results, status) => {
            setSearching(false);
            const lat = ll.lat();
            const lng = ll.lng();
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              results?.[0]
            ) {
              const top = results[0];
              const name = top.name ?? "";
              setValue(name);
              onChangeRef.current({
                name: name || null,
                placeId: top.place_id ?? null,
                address: top.vicinity ?? null,
                lat,
                lng,
                url: top.place_id
                  ? `https://www.google.com/maps/place/?q=place_id:${top.place_id}`
                  : null,
              });
            } else {
              onChangeRef.current({
                ...EMPTY_PLACE,
                name: valueRef.current.trim() || null,
                lat,
                lng,
              });
            }
          },
        );
      },
      () => {
        /* user denied / unavailable — keep silent */
      },
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          onChangeRef.current({ ...EMPTY_PLACE, name: v.trim() || null });
        }}
        placeholder={
          ready
            ? "🔍 ค้นหาร้านอาหาร เช่น สมบูรณ์โภชนา"
            : "กำลังโหลด Google Maps..."
        }
        className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
      />
      <div className="relative">
        <div
          ref={mapDivRef}
          className="h-64 w-full rounded-md border bg-[hsl(var(--muted))] overflow-hidden"
        />
        {ready && (
          <button
            type="button"
            onClick={useMyLocation}
            className="absolute top-2 right-2 rounded-md bg-white text-gray-800 shadow px-2 py-1 text-xs hover:bg-gray-50"
            title="ใช้ตำแหน่งของฉัน"
          >
            📍 ตำแหน่งฉัน
          </button>
        )}
        {searching && (
          <div className="absolute bottom-2 left-2 rounded-md bg-white text-gray-800 shadow px-2 py-1 text-xs">
            กำลังค้นหาร้านใกล้สุด...
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-[hsl(var(--destructive))]">
          ⚠ {error} (กรอกชื่อร้านเองได้)
        </p>
      )}
      {!error && ready && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          พิมพ์ค้นหา หรือคลิก/ลากหมุดบนแผนที่ → ระบบจะดึงชื่อร้านที่ใกล้สุดให้
        </p>
      )}
    </div>
  );
}
