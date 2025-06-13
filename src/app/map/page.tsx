import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRef, useEffect, RefObject } from 'react';
import './map.scss';
import { LeafletLayer } from 'deck.gl-leaflet';
import { MapView } from '@deck.gl/core';

export default function PlainLeafletMap() {
  const mapEl = useRef(null);
  // Store map instance so we can clean up
  const mapRef: RefObject<L.Map|null>  = useRef(null);

  useEffect(() => {
    // Only initialize once
    if (mapRef.current || !mapEl.current) return;

    // Create the map
    mapRef.current = L.map(mapEl.current, {
      center: [50, 15],
      zoom: 5,
      layers: [
        L.tileLayer('https://{s}.maris.nl/cdi/{z}/{x}/{y}.png', {
          subdomains: ['tile', 'tile-a', 'tile-b', 'tile-c'],
        }),
      ],
    });


    //create deckGL layer with sample dataset
    
   // Create deck.gl layer
    const deckLayer = new LeafletLayer({
      // views: [new MapView({ repeat: true })],
      layers: [
        new ScatterplotLayer({
          id: 'points',
          data,
          getPosition: d => d.position,
          getRadius: d => d.size,
          getColor: [255, 0, 0],
          opacity: 0.6,
        }),
      ],
    });

    mapRef.current.addLayer(deckLayer);







    return () => {
        if(mapRef.current) mapRef.current.remove();
        mapRef.current = null;
    };
  }, []);

  return (
      <div ref={mapEl} className="leaflet-map" />
  );
}
