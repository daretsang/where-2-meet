/*
 * MapView.jsx
 * Main interactive map component for the "where-2-meet" application
 * Updated to use ArcGIS Maps SDK for JavaScript (@arcgis/core)
 * Last Updated: April 2026
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as turf from '@turf/turf';

// ArcGIS Core Imports
import esriConfig from '@arcgis/core/config';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils"; 
import Home from "@arcgis/core/widgets/Home";
import "@arcgis/core/assets/esri/themes/light/main.css";

export default function MapViewComponent() {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedCategories = location.state?.categories || [];
  
  const ARCGIS_API_KEY = import.meta.env.VITE_ARCGIS_API_KEY;
  const ORS_TOKEN = import.meta.env.VITE_ORS_TOKEN;
  const ARCGIS_URL = import.meta.env.VITE_ARCGIS_URL;

  const categoryText = selectedCategories.length > 0 
    ? selectedCategories.map(cat => cat.replace(/_/g, ' ')).join(', ') 
    : 'places';

  // =====================================================================
  // STATE MANAGEMENT
  // =====================================================================

  const [people, setPeople] = useState([
    { id: 1, name: 'Person A', address: '', mode: 'driving', coordinates: null, suggestions: [] },
    { id: 2, name: 'Person B', address: '', mode: 'driving', coordinates: null, suggestions: [] }
  ]);
  const [travelTime, setTravelTime] = useState(10);
  const [placingPersonId, setPlacingPersonId] = useState(null);

  const placingPersonIdRef = useRef(null);
  useEffect(() => {
    placingPersonIdRef.current = placingPersonId;
  }, [placingPersonId]);

  const [intersectionPoly, setIntersectionPoly] = useState(null);
  const [individualPolygons, setIndividualPolygons] = useState([]);
  const [foundPlaces, setFoundPlaces] = useState([]);
  const [visiblePlacesCount, setVisiblePlacesCount] = useState(10);

  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);

  // NEW: Added address, lat, and lng to the tooltip state
  const [tooltip, setTooltip] = useState({ 
    show: false, 
    x: 0, y: 0, 
    title: '', subtitle: '', 
    isPlace: false, 
    address: '',
    lat: 0,
    lng: 0,
    website: '', 
    accessible: '', 
    pinned: false, 
    geometry: null 
  });

  const tooltipRef = useRef(tooltip);
  useEffect(() => {
    tooltipRef.current = tooltip;
  }, [tooltip]);

  const colors = [
    [239, 68, 68],  // Red
    [16, 185, 129], // Emerald
    [245, 158, 11], // Amber
    [139, 92, 246], // Violet
    [6, 182, 212]   // Cyan
  ];
  const cssColors = ['#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

  // =====================================================================
  // ARCGIS MAP INITIALIZATION & REFS
  // =====================================================================
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  
  const isochroneLayerRef = useRef(null);
  const intersectionLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const placesLayerRef = useRef(null);

  useEffect(() => {
    if (!mapDiv.current) return;

    esriConfig.apiKey = ARCGIS_API_KEY;

    isochroneLayerRef.current = new GraphicsLayer();
    intersectionLayerRef.current = new GraphicsLayer();
    markersLayerRef.current = new GraphicsLayer();
    placesLayerRef.current = new GraphicsLayer();

    const map = new Map({
      basemap: "streets-navigation-vector" 
    });

    map.add(isochroneLayerRef.current);
    map.add(intersectionLayerRef.current);
    map.add(markersLayerRef.current);
    map.add(placesLayerRef.current);

    const view = new MapView({
      container: mapDiv.current,
      map: map,
      center: [-123.1, 49.25], 
      zoom: 11
    });

    viewRef.current = view;

    const homeWidget = new Home({ view: view });
    view.ui.add(homeWidget, "top-left");

    view.on("click", async (event) => {
      if (placingPersonIdRef.current) {
        handleMapClick(placingPersonIdRef.current, event.mapPoint.longitude, event.mapPoint.latitude);
        return; 
      }

      const response = await view.hitTest(event);
      const graphicHit = response.results.find(
        (r) => r.graphic.layer === markersLayerRef.current || r.graphic.layer === placesLayerRef.current
      );

      if (graphicHit) {
        const graphic = graphicHit.graphic;
        const isPerson = graphic.layer === markersLayerRef.current;
        const screenPoint = view.toScreen(graphic.geometry);

        setTooltip({
          show: true,
          x: screenPoint.x,
          y: screenPoint.y,
          title: isPerson ? `${graphic.attributes.name}'s Location` : graphic.attributes.name,
          subtitle: isPerson ? `Mode: ${graphic.attributes.mode}` : graphic.attributes.category.replace(/_/g, ' '),
          isPlace: !isPerson,
          address: graphic.attributes.address || graphic.attributes.Address || '', // Catch uppercase A just in case
          lat: graphic.geometry.latitude,
          lng: graphic.geometry.longitude,
          website: graphic.attributes.website,
          accessible: graphic.attributes.wheelchair,
          pinned: true,
          geometry: graphic.geometry
        });
      } else {
        setTooltip({ show: false });
      }
    });

    view.on("pointer-move", async (event) => {
      if (placingPersonIdRef.current) {
        mapDiv.current.style.cursor = "crosshair";
        if (!tooltipRef.current.pinned) setTooltip({ show: false });
        return;
      }

      const response = await view.hitTest(event);
      const graphicHit = response.results.find(
        (r) => r.graphic.layer === markersLayerRef.current || r.graphic.layer === placesLayerRef.current
      );

      if (graphicHit) {
        mapDiv.current.style.cursor = "pointer";

        if (!tooltipRef.current.pinned) {
          const graphic = graphicHit.graphic;
          const isPerson = graphic.layer === markersLayerRef.current;

          setTooltip({
            show: true,
            x: event.x,
            y: event.y,
            title: isPerson ? `${graphic.attributes.name}'s Location` : graphic.attributes.name,
            subtitle: isPerson ? `Mode: ${graphic.attributes.mode}` : graphic.attributes.category.replace(/_/g, ' '),
            isPlace: !isPerson,
            address: graphic.attributes.address || graphic.attributes.Address || '',
            lat: graphic.geometry.latitude,
            lng: graphic.geometry.longitude,
            website: graphic.attributes.website,
            accessible: graphic.attributes.wheelchair,
            pinned: false,
            geometry: graphic.geometry
          });
        }
      } else {
        mapDiv.current.style.cursor = "default";
        if (!tooltipRef.current.pinned) {
          setTooltip({ show: false });
        }
      }
    });

    reactiveUtils.watch(
      () => view.extent,
      () => {
        if (tooltipRef.current.pinned && tooltipRef.current.geometry) {
          const screenPoint = view.toScreen(tooltipRef.current.geometry);
          setTooltip(prev => ({ ...prev, x: screenPoint.x, y: screenPoint.y }));
        } else if (!tooltipRef.current.pinned) {
          setTooltip({ show: false });
        }
      }
    );

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [ARCGIS_API_KEY]);

  // =====================================================================
  // SVG EMOJI HELPERS
  // =====================================================================
  
  const createPersonMarker = (emoji) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="32">${emoji}</text></svg>`;
    return {
      type: "picture-marker",
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      width: "36px",
      height: "36px"
    };
  };

  const createPlaceMarker = (emoji) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="white" stroke="#2563eb" stroke-width="2"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="18">${emoji}</text></svg>`;
    return {
      type: "picture-marker",
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      width: "28px",
      height: "28px"
    };
  };

  // =====================================================================
  // DRAWING DATA ON THE MAP
  // =====================================================================
  
  useEffect(() => {
    if (!viewRef.current) return;

    isochroneLayerRef.current.removeAll();
    individualPolygons.forEach((poly, index) => {
      const graphic = new Graphic({
        geometry: {
          type: "polygon",
          rings: poly.geometry.coordinates,
          spatialReference: { wkid: 4326 }
        },
        symbol: {
          type: "simple-fill",
          color: [...colors[index], 0.2], 
          outline: { color: [...colors[index], 0.8], width: 1.5 }
        }
      });
      isochroneLayerRef.current.add(graphic);
    });

    intersectionLayerRef.current.removeAll();
    if (intersectionPoly) {
      const graphic = new Graphic({
        geometry: {
          type: "polygon",
          rings: intersectionPoly.geometry.coordinates,
          spatialReference: { wkid: 4326 }
        },
        symbol: {
          type: "simple-fill",
          color: [30, 58, 138, 0.65], 
          outline: { color: [255, 255, 255, 1], width: 2 } 
        }
      });
      intersectionLayerRef.current.add(graphic);
      viewRef.current.goTo(graphic.geometry.extent.expand(1.5));
    }

    markersLayerRef.current.removeAll();
    people.forEach((person) => {
      if (person.coordinates) {
        const emoji = person.mode === 'driving' ? '🚗' : person.mode === 'cycling' ? '🚲' : '🚌';
        const graphic = new Graphic({
          geometry: {
            type: "point",
            longitude: person.coordinates[0],
            latitude: person.coordinates[1]
          },
          symbol: createPersonMarker(emoji),
          attributes: { 
            name: person.name, 
            mode: person.mode === 'driving' ? 'Drive' : person.mode === 'cycling' ? 'Cycle' : 'Transit' 
          }
        });
        markersLayerRef.current.add(graphic);
      }
    });

  }, [individualPolygons, intersectionPoly, people]);

  useEffect(() => {
    if (!viewRef.current) return;
    placesLayerRef.current.removeAll();
    
    const displayedPlaces = foundPlaces.slice(0, visiblePlacesCount);

    displayedPlaces.forEach((place) => {
      const graphic = new Graphic({
        geometry: {
          type: "point",
          longitude: place.geometry.coordinates[0],
          latitude: place.geometry.coordinates[1]
        },
        symbol: createPlaceMarker(getCategoryIcon(place.properties.category)),
        attributes: place.properties 
      });
      placesLayerRef.current.add(graphic);
    });
  }, [foundPlaces, visiblePlacesCount]);


  // =====================================================================
  // HELPER FUNCTIONS
  // =====================================================================
  
  const addPerson = () => {
    if (people.length >= 5) return; 
    const newId = people.length > 0 ? Math.max(...people.map(p => p.id)) + 1 : 1;
    setPeople([...people, { 
      id: newId, name: `Person ${String.fromCharCode(65 + people.length)}`, 
      address: '', mode: 'driving', coordinates: null, suggestions: []
    }]);
  };

  const removePerson = (idToRemove) => {
    if (people.length <= 2) return; 
    setPeople(people.filter(person => person.id !== idToRemove));
    clearResults(); 
    if (placingPersonId === idToRemove) setPlacingPersonId(null); 
  };

  const updatePerson = (id, field, value) => {
    setPeople(people.map(person => 
      person.id === id ? { ...person, [field]: value } : person
    ));
    clearResults(); 
  };

  const clearResults = () => {
    setIntersectionPoly(null);
    setIndividualPolygons([]);
    setFoundPlaces([]);
    setVisiblePlacesCount(10); 
    setIsListOpen(false); 
    setTooltip({ show: false }); 
  };

  // =====================================================================
  // API CALLS
  // =====================================================================

  const geocodeUrl = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer";

  const handleAddressChange = async (id, text) => {
    setPeople(people.map(person => 
      person.id === id ? { ...person, address: text, coordinates: null } : person
    ));
    setErrorMsg('');
    clearResults();

    if (text.length > 2) {
      try {
        const params = new URLSearchParams({
          text: text,
          location: "-123.1,49.25", 
          f: "json",
          token: ARCGIS_API_KEY
        });
        const response = await fetch(`${geocodeUrl}/suggest?${params}`);
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        
        setPeople(prev => prev.map(person => 
          person.id === id ? { ...person, suggestions: data.suggestions || [] } : person
        ));
      } catch (err) {
        console.error("Autocomplete error:", err);
      }
    } else {
      setPeople(prev => prev.map(person => 
        person.id === id ? { ...person, suggestions: [] } : person
      ));
    }
  };

  const selectSuggestion = async (id, suggestion) => {
    try {
      const params = new URLSearchParams({
        SingleLine: suggestion.text,
        magicKey: suggestion.magicKey,
        f: "json",
        token: ARCGIS_API_KEY
      });
      const response = await fetch(`${geocodeUrl}/findAddressCandidates?${params}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);
      
      if (data.candidates && data.candidates.length > 0) {
        const location = data.candidates[0].location;
        setPeople(people.map(person => 
          person.id === id ? { 
            ...person, 
            address: suggestion.text, 
            coordinates: [location.x, location.y], 
            suggestions: [] 
          } : person
        ));
      }
    } catch(err) {
      console.error("Failed to fetch coordinates", err);
    }
  };

  const geocodeAddress = async (address) => {
    const params = new URLSearchParams({
      SingleLine: address,
      location: "-123.1,49.25",
      f: "json",
      token: ARCGIS_API_KEY
    });
    const response = await fetch(`${geocodeUrl}/findAddressCandidates?${params}`);
    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);
    
    if (data.candidates && data.candidates.length > 0) {
      return [data.candidates[0].location.x, data.candidates[0].location.y];
    }
    throw new Error(`Could not find: ${address}`);
  };

  const reverseGeocode = async (lng, lat) => {
    const params = new URLSearchParams({
      location: `${lng},${lat}`,
      f: "json",
      token: ARCGIS_API_KEY
    });
    
    try {
      const response = await fetch(`${geocodeUrl}/reverseGeocode?${params}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);
      if (data.address) return data.address.Match_addr;
    } catch (err) {
      console.error("Reverse geocode failed", err);
    }
    
    return `Dropped Pin (${lng.toFixed(4)}, ${lat.toFixed(4)})`; 
  };

  const handleMapClick = async (personId, lng, lat) => {
    setPeople(prev => prev.map(person => 
      person.id === personId 
        ? { ...person, address: "Pinpointing location...", coordinates: [lng, lat], suggestions: [] } 
        : person
    ));

    try {
      const readableAddress = await reverseGeocode(lng, lat);
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, address: readableAddress } 
          : person
      ));
    } catch (err) {
      console.error("Reverse geocode failed", err);
    }

    setPlacingPersonId(null);
    clearResults();
  };

  const getTravelPolygon = async (coordinates, mode, time) => {
    if (mode === 'driving' || mode === 'cycling') {
      const profile = mode === 'driving' ? 'driving-car' : 'cycling-regular';
      const url = `https://api.openrouteservice.org/v2/isochrones/${profile}`;
      
      const response = await fetch(url, {
        method: 'POST', 
        headers: {
          'Accept': 'application/json, application/geo+json',
          'Content-Type': 'application/json',
          'Authorization': ORS_TOKEN 
        },
        body: JSON.stringify({
          locations: [[coordinates[0], coordinates[1]]], range: [time * 60] 
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "Routing API error.");
      return data.features[0]; 
    } else {
      const radius = (time / 10) * 3;
      return turf.circle(coordinates, radius, { steps: 64, units: 'kilometers' });
    }
  };

  const fetchPlacesFromArcGIS = async (overlapPolygon) => {
    if (!ARCGIS_URL) return;

    const esriGeometry = {
      rings: overlapPolygon.geometry.coordinates,
      spatialReference: { wkid: 4326 }
    };

    const categoryList = selectedCategories.map(c => `'${c}'`).join(',');
    const whereClause = selectedCategories.length > 0 ? `category IN (${categoryList})` : '1=1';

    const params = new URLSearchParams({
      f: 'geojson',
      where: whereClause,
      geometry: JSON.stringify(esriGeometry),
      geometryType: 'esriGeometryPolygon',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'true'
    });

    try {
      const response = await fetch(`${ARCGIS_URL}/query`, {
        method: 'POST', 
        body: params
      });
      
      const data = await response.json();
      if (data.features) {
        const centerPoint = turf.centroid(overlapPolygon);
        const sortedPlaces = data.features.sort((a, b) => {
          const distanceA = turf.distance(centerPoint, a);
          const distanceB = turf.distance(centerPoint, b);
          return distanceA - distanceB; 
        });
        setFoundPlaces(sortedPlaces);
      }
    } catch (err) {
      console.error("Error fetching places:", err);
    }
  };

  const handleFindMiddle = async () => {
    setErrorMsg('');
    clearResults();
    setIsLegendOpen(true); 
    setPlacingPersonId(null); 
    
    if (people.some(p => !p.address.trim() && !p.coordinates)) {
      setErrorMsg('Please enter an address or drop a pin for everyone first!');
      return;
    }

    setIsSearching(true);

    try {
      const updatedPeople = await Promise.all(
        people.map(async (person) => {
          if (person.coordinates) return person; 
          const coords = await geocodeAddress(person.address);
          return { ...person, coordinates: coords };
        })
      );
      setPeople(updatedPeople);

      const polygons = await Promise.all(
        updatedPeople.map(person => getTravelPolygon(person.coordinates, person.mode, travelTime))
      );
      setIndividualPolygons(polygons);

      let overlap = polygons[0];
      for (let i = 1; i < polygons.length; i++) {
        overlap = turf.intersect(turf.featureCollection([overlap, polygons[i]]));
        if (!overlap) break;
      }

      if (!overlap) {
        setErrorMsg("These locations are too far apart! Try expanding the travel time or choosing closer starting points.");
      } else {
        setIntersectionPoly(overlap);
        await fetchPlacesFromArcGIS(overlap);
      }

    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = { 
      cafes: '☕', restaurants: '🍔', parks: '🌳', museums: '🏛️', libraries: '📚', 
      art_galleries: '🎨', shopping_malls: '🛍️', waterbodies: '🏖️', aquarium: '🐠', 
      desserts_bakeries: '🍰', recreation_gyms: '🏋️', beauty: '💅', dog_parks: '🐕', 
      nightlife: '🍻', niche_fun: '🎯'
    };
    return icons[category] || '📍';
  };

  const displayedPlaces = foundPlaces.slice(0, visiblePlacesCount);
  const activeCategories = [...new Set(displayedPlaces.map(p => p.properties.category))];

  // Tooltip Stricter Validations
  const hasWebsite = tooltip.website && typeof tooltip.website === 'string' && tooltip.website.trim() !== '' && tooltip.website.toLowerCase() !== 'null';
  const isAccessible = tooltip.accessible === 'yes' || tooltip.accessible === 'Yes';

  const handlePlaceHover = (place) => {
    if (tooltipRef.current.pinned || !viewRef.current) return;
    
    const graphics = placesLayerRef.current.graphics.items;
    const targetGraphic = graphics.find(g => 
      g.attributes.name === place.properties.name && 
      g.geometry.longitude === place.geometry.coordinates[0]
    );

    if (targetGraphic) {
      const screenPoint = viewRef.current.toScreen(targetGraphic.geometry);
      setTooltip({
        show: true,
        x: screenPoint.x,
        y: screenPoint.y,
        title: targetGraphic.attributes.name,
        subtitle: targetGraphic.attributes.category.replace(/_/g, ' '),
        isPlace: true,
        address: targetGraphic.attributes.address || targetGraphic.attributes.Address || '',
        lat: targetGraphic.geometry.latitude,
        lng: targetGraphic.geometry.longitude,
        website: targetGraphic.attributes.website,
        accessible: targetGraphic.attributes.wheelchair,
        pinned: false,
        geometry: targetGraphic.geometry
      });
    }
  };

  const handlePlaceClick = (place) => {
    if (!viewRef.current) return;
    
    const graphics = placesLayerRef.current.graphics.items;
    const targetGraphic = graphics.find(g => 
      g.attributes.name === place.properties.name && 
      g.geometry.longitude === place.geometry.coordinates[0]
    );

    if (targetGraphic) {
      viewRef.current.goTo({ target: targetGraphic.geometry, zoom: 14 }).then(() => {
        const screenPoint = viewRef.current.toScreen(targetGraphic.geometry);
        setTooltip({
          show: true,
          x: screenPoint.x,
          y: screenPoint.y,
          title: targetGraphic.attributes.name,
          subtitle: targetGraphic.attributes.category.replace(/_/g, ' '),
          isPlace: true,
          address: targetGraphic.attributes.address || targetGraphic.attributes.Address || '',
          lat: targetGraphic.geometry.latitude,
          lng: targetGraphic.geometry.longitude,
          website: targetGraphic.attributes.website,
          accessible: targetGraphic.attributes.wheelchair,
          pinned: true,
          geometry: targetGraphic.geometry
        });
      });
    }
  };

  const clearHighlight = () => {
    if (!tooltipRef.current.pinned) {
      setTooltip({ show: false });
    }
  };

  // =====================================================================
  // RENDER UI
  // =====================================================================
  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 overflow-hidden">
      
      {/* Sidebar UI */}
      <div className="w-full md:w-[450px] bg-white shadow-xl z-10 flex flex-col">
        <div className="p-6 overflow-y-auto">
          <button onClick={() => navigate('/activity')} className="flex items-center text-sm font-semibold text-slate-400 hover:text-blue-600 transition-colors mb-3 group">
            <span className="group-hover:-translate-x-1 transition-transform mr-1">←</span> Back to activities
          </button>
          <h2 className="text-2xl font-bold text-slate-800 mb-2 capitalize">Finding {categoryText}</h2>
          <p className="text-sm text-slate-500 mb-6">Enter everyone's starting location.</p>
          
          <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-blue-900">Max Travel Time</label>
              <span className="text-sm font-bold text-blue-700 bg-blue-200 px-2 py-1 rounded-md">{travelTime} mins</span>
            </div>
            <input 
              type="range" min="5" max="30" step="5" value={travelTime} 
              onChange={(e) => {
                setTravelTime(parseInt(e.target.value));
                clearResults();
              }}
              className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-blue-400 mt-1 font-semibold">
              <span>5m</span><span>30m</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {people.map((person, index) => {
              const isPlacing = placingPersonId === person.id;
              
              return (
                <div key={person.id} className="p-3 bg-slate-50 border-2 rounded-xl relative transition-colors" style={{ borderColor: individualPolygons.length > 0 ? cssColors[index] : '#e2e8f0' }}>
                  <div className="flex justify-between items-center mb-2">
                    <input type="text" value={person.name} onChange={(e) => updatePerson(person.id, 'name', e.target.value)} className="text-sm font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 hover:border-blue-400 focus:outline-none transition px-1 w-1/2" />
                    {people.length > 2 && (
                      <button onClick={() => removePerson(person.id)} className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50 transition">Remove</button>
                    )}
                  </div>
                  <div className="flex gap-2 relative">
                    <div className="flex-1 relative flex items-center">
                      <input 
                        type="text" 
                        placeholder={isPlacing ? "Click anywhere on the map..." : "Search address..."} 
                        value={person.address} 
                        onChange={(e) => handleAddressChange(person.id, e.target.value)} 
                        className={`w-full p-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-colors ${isPlacing ? 'bg-blue-100 border-blue-400 text-blue-800 font-medium' : 'border-slate-300'}`} 
                        disabled={isPlacing} 
                      />
                      
                      <button 
                        onClick={() => setPlacingPersonId(isPlacing ? null : person.id)}
                        className={`absolute right-2 text-lg hover:scale-110 transition-transform ${isPlacing ? 'drop-shadow-md' : 'opacity-60 hover:opacity-100'}`}
                        title={isPlacing ? "Cancel dropping pin" : "Drop a pin on the map"}
                      >
                        {isPlacing ? '❌' : '📍'}
                      </button>

                      {person.suggestions.length > 0 && !isPlacing && (
                        <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden z-50">
                          {person.suggestions.map((suggestion, i) => (
                            <li key={i} onClick={() => selectSuggestion(person.id, suggestion)} className="p-3 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0">
                              <div className="font-semibold text-slate-900 truncate">{suggestion.text}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <select value={person.mode} onChange={(e) => updatePerson(person.id, 'mode', e.target.value)} className="p-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer h-10">
                      <option value="driving">🚗 Drive</option>
                      <option value="cycling">🚲 Cycle</option>
                      <option value="transit">🚌 Transit</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {people.length < 5 && (
            <button onClick={addPerson} className="mt-4 w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl font-semibold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition">+ Add another person</button>
          )}

          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-200">⚠️ {errorMsg}</div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 mt-auto">
          <button onClick={handleFindMiddle} disabled={isSearching} className={`w-full text-white font-bold py-4 rounded-xl transition shadow-md ${isSearching ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isSearching ? 'Calculating Zone...' : 'Find the Middle'}
          </button>

          {foundPlaces.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-3 text-center">
                Displaying <span className="text-blue-600 font-bold">{displayedPlaces.length}</span> of <span className="font-bold">{foundPlaces.length}</span> results
              </p>
              
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {visiblePlacesCount > 10 && (
                    <button onClick={() => setVisiblePlacesCount(prev => Math.max(10, prev - 10))} className="flex-1 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-200 transition shadow-sm">- Show Less</button>
                  )}
                  {visiblePlacesCount < foundPlaces.length && (
                    <button onClick={() => setVisiblePlacesCount(prev => prev + 10)} className="flex-1 py-2 bg-blue-50 text-blue-600 text-sm font-bold rounded-lg hover:bg-blue-100 transition shadow-sm">+ Show 10 More</button>
                  )}
                </div>
                {visiblePlacesCount < foundPlaces.length && (
                  <button onClick={() => setVisiblePlacesCount(foundPlaces.length)} className="w-full py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-200 transition shadow-sm">Show All</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ARCGIS MAP CONTAINER */}
      <div className="flex-1 relative">
        <div ref={mapDiv} className="absolute inset-0" />

        {/* CUSTOM REACT TOOLTIP */}
        {tooltip.show && (
          <div 
            className="absolute z-50 bg-white text-slate-800 px-4 py-3 rounded-xl shadow-2xl transform -translate-x-1/2 -translate-y-full transition-opacity duration-75 border border-slate-200 min-w-[200px]"
            style={{ left: tooltip.x, top: tooltip.y - 20, pointerEvents: tooltip.pinned ? 'auto' : 'none' }} 
          >
            {tooltip.pinned && (
              <button 
                onClick={() => setTooltip({ show: false })} 
                className="absolute top-2 right-2.5 text-slate-400 hover:text-slate-800 text-xl leading-none transition-colors"
              >
                &times;
              </button>
            )}

            <div className={`font-bold text-sm leading-tight ${tooltip.pinned ? 'pr-6' : ''}`}>{tooltip.title}</div>
            <div className="text-xs font-semibold text-blue-600 capitalize mt-0.5">{tooltip.subtitle}</div>
            
            {/* NEW: Render Address String */}
            {tooltip.isPlace && tooltip.address && (
              <div className="text-xs text-slate-500 mt-1 leading-snug">{tooltip.address}</div>
            )}
            
            {/* Action Links & Accessibility */}
            {tooltip.isPlace && (
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5 flex flex-col">
                {hasWebsite && (
                  <div className="text-xs text-slate-600 flex items-center gap-1.5">
                    🌐 <a href={tooltip.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">View Website</a>
                  </div>
                )}
                
                {/* NEW: Google Maps Coordinate URL */}
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  📍 <a href={`https://www.google.com/maps/search/?api=1&query=${tooltip.lat},${tooltip.lng}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Open in Google Maps</a>
                </div>

                {isAccessible && (
                  <div className="text-xs text-green-600 font-bold flex items-center gap-1.5">♿ Wheelchair Accessible</div>
                )}
              </div>
            )}

            <div className="absolute w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45 left-1/2 -bottom-1.5 -translate-x-1/2"></div>
          </div>
        )}

        {/* Legend Overlay (Top Right) */}
        {individualPolygons.length > 0 && (
          <div className="absolute top-4 right-4 z-10 flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
              {isLegendOpen ? (
                <div className="bg-white/95 backdrop-blur-sm p-5 rounded-2xl shadow-xl border border-slate-200 w-72 sm:w-80 relative animate-in fade-in zoom-in-95 duration-200">
                  <button onClick={() => setIsLegendOpen(false)} className="absolute top-3 right-4 text-slate-400 hover:text-slate-700 transition"><span className="text-xl font-bold leading-none">&times;</span></button>
                  <h3 className="font-extrabold text-slate-800 mb-3 border-b border-slate-100 pb-2">Map Legend</h3>
                  
                  <div className="space-y-3">
                    {people.map((person, i) => (
                      person.coordinates && individualPolygons[i] && (
                        <div key={person.id} className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-md border border-slate-300 shadow-inner" style={{ backgroundColor: cssColors[i], opacity: 0.6 }}></div>
                          <span className="text-slate-600 text-sm font-medium">
                            {person.name} 
                            <span className="text-slate-400 text-xs ml-1">
                              ({travelTime}m {person.mode === 'driving' ? 'Drive' : person.mode === 'cycling' ? 'Cycle' : 'Transit'})
                            </span>
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                  
                  {intersectionPoly && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-3">
                      <div className="w-5 h-5 rounded-md border border-slate-300 shadow-inner" style={{ backgroundColor: '#1e3a8a', opacity: 0.8 }}></div>
                      <span className="text-slate-900 text-sm font-bold">The Middle Area</span>
                    </div>
                  )}

                  {foundPlaces.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <span className="text-slate-900 text-sm font-bold block mb-2">Places Found:</span>
                      
                      <div className="space-y-2 mb-3">
                        {activeCategories.map(cat => (
                          <div key={cat} className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm border border-blue-600 text-xs">
                              {getCategoryIcon(cat)}
                            </div>
                            <span className="text-slate-600 text-sm font-medium capitalize">
                              {cat.replace(/_/g, ' ')}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-50 flex items-center gap-2">
                        <span className="text-slate-500 text-xs font-bold w-full text-right">
                          {displayedPlaces.length} of {foundPlaces.length} Shown
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setIsLegendOpen(true)} className="bg-white/95 backdrop-blur-sm px-4 py-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 font-bold hover:bg-blue-50 transition hover:shadow-xl animate-in fade-in zoom-in-95">🗺️ Show Legend</button>
              )}
            </div>
          </div>
        )}

        {/* LIST OF PLACES OVERLAY (Bottom Right) */}
        {foundPlaces.length > 0 && (
          <div className="absolute bottom-8 right-4 z-10 flex flex-col items-end pointer-events-none">
             <div className="pointer-events-auto w-72 sm:w-80">
                 <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 flex flex-col max-h-[50vh] transition-all duration-300 pointer-events-auto">
                    <button 
                      onClick={() => setIsListOpen(!isListOpen)} 
                      className={`w-full flex justify-between items-center p-4 hover:bg-slate-50 transition rounded-t-2xl ${!isListOpen ? 'rounded-b-2xl' : 'border-b border-slate-100'}`}
                    >
                      <span className="font-extrabold text-slate-800 text-sm">📋 List of Places</span>
                      <span className="text-lg text-slate-500 font-bold leading-none">{isListOpen ? '▾' : '▴'}</span>
                    </button>

                    {isListOpen && (
                      <div className="overflow-y-auto p-2 space-y-1">
                        {displayedPlaces.map((place, idx) => (
                          <div 
                            key={`list-item-${idx}`}
                            className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-blue-400 hover:shadow-md transition cursor-pointer flex gap-3 items-center"
                            onMouseEnter={() => handlePlaceHover(place)}
                            onMouseLeave={clearHighlight}
                            onClick={() => handlePlaceClick(place)}
                          >
                            <div className="text-2xl">{getCategoryIcon(place.properties.category)}</div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-slate-900 truncate">{place.properties.name}</h4>
                              <p className="text-xs text-blue-600 font-semibold capitalize truncate">{place.properties.category.replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                 </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}