/*
 * MapView.jsx
 * Main interactive map component for the "where-2-meet" application
 * This component handles user inputs, geocoding addresses via Mapbox, 
 * calculating travel time polygons (isochrones) via OpenRouteService, 
 * finding the geographic intersection using Turf.js, and finally fetching 
 * relevant Points of Interest (POIs) from an ArcGIS Online database
 * * Last Updated: April 7, 2026
 * Authors: Darren Tsang, Mackenzie Thompson, Jeffrey Kim
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl/mapbox';
import * as turf from '@turf/turf';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function MapView() {
  const location = useLocation();
  const navigate = useNavigate();

  // Retrieve selected categories from the previous page
  const selectedCategories = location.state?.categories || [];
  
  // Environment Variables
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
  const ORS_TOKEN = import.meta.env.VITE_ORS_TOKEN;
  const ARCGIS_URL = import.meta.env.VITE_ARCGIS_URL;

  // Format categories for heading
  const categoryText = selectedCategories.length > 0 
    ? selectedCategories.map(cat => cat.replace(/_/g, ' ')).join(', ') 
    : 'places';

  // =====================================================================
  // STATE MANAGEMENT
  // =====================================================================

  // User Input State
  const [people, setPeople] = useState([
    { id: 1, name: 'Person A', address: '', mode: 'driving', coordinates: null, suggestions: [] },
    { id: 2, name: 'Person B', address: '', mode: 'driving', coordinates: null, suggestions: [] }
  ]);
  const [travelTime, setTravelTime] = useState(10);

  // State to track which person we are currently dropping a pin for
  const [placingPersonId, setPlacingPersonId] = useState(null);

  // Map & Geospatial Data State
  const [intersectionPoly, setIntersectionPoly] = useState(null);
  const [individualPolygons, setIndividualPolygons] = useState([]);
  const [foundPlaces, setFoundPlaces] = useState([]);
  
  // State to track how many results are currently visible on the map
  const [visiblePlacesCount, setVisiblePlacesCount] = useState(10);

  // NEW: State to track if the results list is open in the sidebar
  const [isListOpen, setIsListOpen] = useState(false);

  // UI Interaction & Hover State
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [hoveredPlace, setHoveredPlace] = useState(null);

  // Colours for user's reachable zones
  const colors = ['#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

  // =====================================================================
  // HELPER FUNCTIONS (State Mutation)
  // =====================================================================
  const addPerson = () => {
    // Cap of 5 people to prevent map clutter and API overload
    if (people.length >= 5) return; 
    const newId = people.length > 0 ? Math.max(...people.map(p => p.id)) + 1 : 1;
    setPeople([...people, { 
      id: newId, name: `Person ${String.fromCharCode(65 + people.length)}`, // Auto-names: Person C, D, etc.
      address: '', mode: 'driving', coordinates: null, suggestions: []
    }]);
  };

  const removePerson = (idToRemove) => {
    if (people.length <= 2) return; // Must have at least 2 people to find a middle
    setPeople(people.filter(person => person.id !== idToRemove));
    clearResults(); // Invalidate the map if the participant list changes
    if (placingPersonId === idToRemove) setPlacingPersonId(null); // Cancel pin drop if removed
  };

  const updatePerson = (id, field, value) => {
    setPeople(people.map(person => 
      person.id === id ? { ...person, [field]: value } : person
    ));
    clearResults(); // Invalidate map on any parameter change
  };

  // Clears all rendered shapes and markers from the map
  const clearResults = () => {
    setIntersectionPoly(null);
    setIndividualPolygons([]);
    setFoundPlaces([]);
    setHoveredPlace(null);
    setVisiblePlacesCount(10); // Reset the counter back to 10 whenever a new search happens
    setIsListOpen(false); // NEW: Close the list when results are cleared
  };

  // =====================================================================
  // API CALLS & BUSINESS LOGIC
  // =====================================================================

  /*
   * Fires every time a user types in an address box. 
   * Fetches autocomplete suggestions from Mapbox to prevent typos.
   */
  const handleAddressChange = async (id, text) => {
    setPeople(people.map(person => 
      person.id === id ? { ...person, address: text, coordinates: null } : person
    ));
    setErrorMsg('');
    clearResults();

    if (text.length > 2) {
      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json`;
        // Bias results heavily towards the Vancouver area coordinates
        const params = new URLSearchParams({
          access_token: MAPBOX_TOKEN, proximity: '-123.1,49.25', autocomplete: 'true', limit: 4
        });
        const response = await fetch(`${endpoint}?${params}`);
        const data = await response.json();
        setPeople(prev => prev.map(person => 
          person.id === id ? { ...person, suggestions: data.features || [] } : person
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

  // Locks in the user's selection from the autocomplete dropdown
  const selectSuggestion = (id, feature) => {
    setPeople(people.map(person => 
      person.id === id ? { 
        ...person, address: feature.place_name, coordinates: feature.center, suggestions: [] // Save exact [lng, lat] to skip geocoding later
      } : person
    ));
  };

  // Fallback geocoder if a user types a full address but never clicks a suggestion
  const geocodeAddress = async (address) => {
    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
    const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, proximity: '-123.1,49.25', limit: 1 });
    const response = await fetch(`${endpoint}?${params}`);
    const data = await response.json();
    if (data.features && data.features.length > 0) return data.features[0].center;
    throw new Error(`Could not find: ${address}`);
  };

  // Reverse Geocoder (Translates Map Clicks into Readable Addresses)
  const reverseGeocode = async (lng, lat) => {
    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`;
    const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, limit: 1 });
    const response = await fetch(`${endpoint}?${params}`);
    const data = await response.json();
    // Return the formatted place name, or a raw coordinate string if the ocean is clicked
    if (data.features && data.features.length > 0) return data.features[0].place_name;
    return `Dropped Pin (${lng.toFixed(4)}, ${lat.toFixed(4)})`; 
  };

  // Generates the travel boundary (Isochrone) for a specific user.
  const getTravelPolygon = async (coordinates, mode, time) => {
    if (mode === 'driving') {
      const url = 'https://api.openrouteservice.org/v2/isochrones/driving-car';
      const response = await fetch(url, {
        method: 'POST', // ORS requires POST for isochrones
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
      // Mock transit logic: Creates a simple circular radius using Turf.js
      // Assumes roughly 3km of travel per 10 minutes
      const radius = (time / 10) * 3;
      return turf.circle(coordinates, radius, { steps: 64, units: 'kilometers' });
    }
  };

  /*
   * Queries the ArcGIS Online dataset to find POIs that fall geographically 
   * inside the calculated intersection polygon
   */
  const fetchPlacesFromArcGIS = async (overlapPolygon) => {
    if (!ARCGIS_URL) {
      console.warn("No ArcGIS URL provided. Skipping place fetch.");
      return;
    }

    // Convert standard GeoJSON into Esri's proprietary geometry format
    const esriGeometry = {
      rings: overlapPolygon.geometry.coordinates,
      spatialReference: { wkid: 4326 }
    };

    // SQL query to filter places by selected categories. If no categories are selected, fetch all places.
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
        method: 'POST', // ArcGIS often requires POST for complex queries, even if it's just URL parameters
        body: params
      });
      
      const data = await response.json();
      if (data.features) {
        // Sort the fetched places by their distance to the dead-center of the overlap polygon!
        const centerPoint = turf.centroid(overlapPolygon);
        
        const sortedPlaces = data.features.sort((a, b) => {
          const distanceA = turf.distance(centerPoint, a);
          const distanceB = turf.distance(centerPoint, b);
          return distanceA - distanceB; // Closest items move to the top of the array
        });

        setFoundPlaces(sortedPlaces);
      }
    } catch (err) {
      console.error("Error fetching places:", err);
    }
  };

  /*
   * MASTER FUNCTION: Orchestrates the entire calculation sequence.
   * 1. Geocodes missing coordinates.
   * 2. Fetches travel polygons for everyone.
   * 3. Calculates intersection overlap.
   * 4. Fetches POIs from ArcGIS based on overlap.
   */
  const handleFindMiddle = async () => {
    setErrorMsg('');
    clearResults();
    setIsLegendOpen(true); 
    setPlacingPersonId(null); // Cancel any active pin dropping
    
    // Validation check
    if (people.some(p => !p.address.trim() && !p.coordinates)) {
      setErrorMsg('Please enter an address or drop a pin for everyone first!');
      return;
    }

    setIsSearching(true);

    try {
      // Ensure everyone has [lng, lat] coordinates
      const updatedPeople = await Promise.all(
        people.map(async (person) => {
          if (person.coordinates) return person; 
          const coords = await geocodeAddress(person.address);
          return { ...person, coordinates: coords };
        })
      );
      setPeople(updatedPeople);

      // Fetch isochrone polygons for everyone simultaneously
      const polygons = await Promise.all(
        updatedPeople.map(person => getTravelPolygon(person.coordinates, person.mode, travelTime))
      );
      setIndividualPolygons(polygons);

      // Iterate through polygons and smash them together to find the common area
      let overlap = polygons[0];
      for (let i = 1; i < polygons.length; i++) {
        overlap = turf.intersect(turf.featureCollection([overlap, polygons[i]]));
        if (!overlap) break;
      }

      if (!overlap) {
        setErrorMsg("These locations are too far apart! Try expanding the travel time or choosing closer starting points.");
      } else {
        setIntersectionPoly(overlap);
        
        // Final fetch to populate the map with locations
        await fetchPlacesFromArcGIS(overlap);
      }

    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Map Clicks for Dropping Pins
  const handleMapClick = async (e) => {
    // If we aren't in "drop pin mode", do nothing.
    if (!placingPersonId) return;

    const { lng, lat } = e.lngLat;
    
    // Set a temporary "Loading..." text so the user knows it registered
    setPeople(people.map(person => 
      person.id === placingPersonId 
        ? { ...person, address: "Pinpointing location...", coordinates: [lng, lat], suggestions: [] } 
        : person
    ));

    try {
      const readableAddress = await reverseGeocode(lng, lat);
      // Update the person with the new readable address and exact coordinates
      setPeople(prev => prev.map(person => 
        person.id === placingPersonId 
          ? { ...person, address: readableAddress } 
          : person
      ));
    } catch (err) {
      console.error("Reverse geocode failed", err);
    }

    // Turn off "drop pin mode" and clear previous calculation results
    setPlacingPersonId(null);
    clearResults();
  };

  // Emojis to symbolize points
  const getCategoryIcon = (category) => {
    const icons = { 
      cafes: '☕', 
      restaurants: '🍔', 
      parks: '🌳', 
      museums: '🏛️', 
      libraries: '📚', 
      art_galleries: '🎨',
      shopping_malls: '🛍️',
      waterbodies: '🏖️',
      aquarium: '🐠',
      desserts_bakeries: '🍰',
      recreation_gyms: '🏋️',
      beauty: '💅',
      dog_parks: '🐕',
      nightlife: '🍻',
      niche_fun: '🎯'
    };
    return icons[category] || '📍';
  };

  // Slice the array to only contain the number of places we want to show
  const displayedPlaces = foundPlaces.slice(0, visiblePlacesCount);

  // =====================================================================
  // RENDER UI
  // =====================================================================
  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 overflow-hidden">
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
                <div key={person.id} className="p-3 bg-slate-50 border-2 rounded-xl relative transition-colors" style={{ borderColor: individualPolygons.length > 0 ? colors[index] : '#e2e8f0' }}>
                  <div className="flex justify-between items-center mb-2">
                    <input type="text" value={person.name} onChange={(e) => updatePerson(person.id, 'name', e.target.value)} className="text-sm font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 hover:border-blue-400 focus:outline-none transition px-1 w-1/2" />
                    {people.length > 2 && (
                      <button onClick={() => removePerson(person.id)} className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50 transition">Remove</button>
                    )}
                  </div>
                  <div className="flex gap-2 relative">
                    {/* Input wrapper modified to include the Pin Button */}
                    <div className="flex-1 relative flex items-center">
                      <input 
                        type="text" 
                        placeholder={isPlacing ? "Click anywhere on the map..." : "Search address..."} 
                        value={person.address} 
                        onChange={(e) => handleAddressChange(person.id, e.target.value)} 
                        // Highlight the input box blue if they are currently dropping a pin
                        className={`w-full p-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-colors ${isPlacing ? 'bg-blue-100 border-blue-400 text-blue-800 font-medium' : 'border-slate-300'}`} 
                        disabled={isPlacing} // Disable typing while placing a pin
                      />
                      
                      {/* Drop Pin Button sitting inside the right edge of the text input */}
                      <button 
                        onClick={() => setPlacingPersonId(isPlacing ? null : person.id)}
                        className={`absolute right-2 text-lg hover:scale-110 transition-transform ${isPlacing ? 'drop-shadow-md' : 'opacity-60 hover:opacity-100'}`}
                        title={isPlacing ? "Cancel dropping pin" : "Drop a pin on the map"}
                      >
                        {isPlacing ? '❌' : '📍'}
                      </button>

                      {person.suggestions.length > 0 && !isPlacing && (
                        <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden z-50">
                          {person.suggestions.map((feature) => (
                            <li key={feature.id} onClick={() => selectSuggestion(person.id, feature)} className="p-3 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0">
                              <div className="font-semibold text-slate-900 truncate">{feature.text}</div>
                              <div className="text-xs text-slate-500 truncate">{feature.place_name.replace(`${feature.text}, `, '')}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <select value={person.mode} onChange={(e) => updatePerson(person.id, 'mode', e.target.value)} className="p-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer h-10">
                      <option value="driving">🚗 Drive</option>
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

          {/* Pagination Controls */}
          {foundPlaces.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-3 text-center">
                Displaying <span className="text-blue-600 font-bold">{displayedPlaces.length}</span> of <span className="font-bold">{foundPlaces.length}</span> results
              </p>
              
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {/* Show Less Button */}
                  {visiblePlacesCount > 10 && (
                    <button 
                      onClick={() => setVisiblePlacesCount(prev => Math.max(10, prev - 10))}
                      className="flex-1 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-200 transition shadow-sm"
                    >
                      - Show Less
                    </button>
                  )}
                  
                  {/* Show 10 More Button */}
                  {visiblePlacesCount < foundPlaces.length && (
                    <button 
                      onClick={() => setVisiblePlacesCount(prev => prev + 10)}
                      className="flex-1 py-2 bg-blue-50 text-blue-600 text-sm font-bold rounded-lg hover:bg-blue-100 transition shadow-sm"
                    >
                      + Show 10 More
                    </button>
                  )}
                </div>
                
                {/* Show All Button */}
                {visiblePlacesCount < foundPlaces.length && (
                  <button 
                    onClick={() => setVisiblePlacesCount(foundPlaces.length)}
                    className="w-full py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-200 transition shadow-sm"
                  >
                    Show All
                  </button>
                )}
              </div>

              {/* NEW: COLLAPSIBLE LIST OF PLACES */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <button 
                  onClick={() => setIsListOpen(!isListOpen)}
                  className="w-full flex justify-between items-center text-sm font-bold text-slate-700 hover:text-blue-600 transition"
                >
                  <span>📋 {isListOpen ? 'Hide' : 'View'} List of Places</span>
                  <span className="text-lg">{isListOpen ? '▴' : '▾'}</span>
                </button>

                {isListOpen && (
                  <div className="mt-3 max-h-64 overflow-y-auto pr-1 space-y-2">
                    {displayedPlaces.map((place, idx) => (
                      <div 
                        key={`list-item-${idx}`}
                        className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition cursor-pointer flex gap-3 items-center"
                        // Magic Trick: Hovering the list item triggers the map popup!
                        onMouseEnter={() => setHoveredPlace(place)}
                        onMouseLeave={() => setHoveredPlace(null)}
                      >
                        <div className="text-2xl">{getCategoryIcon(place.properties.category)}</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{place.properties.name}</h4>
                          <p className="text-xs text-blue-600 font-semibold capitalize truncate">{place.properties.category.replace(/_/g, ' ')}</p>
                          {place.properties.wheelchair === 'yes' && (
                            <p className="text-[10px] text-green-600 font-bold mt-1 uppercase tracking-wider">♿ Accessible</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>

      {/* The Map Area */}
      <div className="flex-1 relative">
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: -123.1, latitude: 49.25, zoom: 10 }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          // Changes cursor to crosshair and listens for clicks when a pin is being dropped
          cursor={placingPersonId ? 'crosshair' : 'grab'}
          onClick={handleMapClick}
        >
          {individualPolygons.map((poly, index) => (
            <Source key={`source-indiv-${index}`} type="geojson" data={poly}>
              <Layer 
                id={`layer-indiv-${index}`} type="fill" 
                paint={{ 'fill-color': colors[index], 'fill-opacity': 0.2, 'fill-outline-color': colors[index] }} 
              />
            </Source>
          ))}

          {intersectionPoly && (
            <Source type="geojson" data={intersectionPoly}>
              <Layer 
                id="intersection-layer" type="fill" 
                paint={{ 'fill-color': '#1e3a8a', 'fill-opacity': 0.65, 'fill-outline-color': '#ffffff' }} 
              />
            </Source>
          )}

          {people.map((person) => (
            person.coordinates && (
              <Marker key={`marker-${person.id}`} longitude={person.coordinates[0]} latitude={person.coordinates[1]} anchor="bottom">
                <div 
                  className={`text-4xl drop-shadow-md cursor-pointer transition-transform ${placingPersonId === person.id ? 'animate-bounce' : 'hover:scale-110'}`}
                  onMouseEnter={() => setHoveredMarker(person)}
                  onMouseLeave={() => setHoveredMarker(null)}
                >
                  {person.mode === 'driving' ? '🚗' : '🚌'}
                </div>
              </Marker>
            )
          ))}

          {/* We now map over `displayedPlaces` instead of `foundPlaces`! */}
          {displayedPlaces.map((place, idx) => (
            <Marker 
              key={`place-${idx}`} 
              longitude={place.geometry.coordinates[0]} 
              latitude={place.geometry.coordinates[1]}
              anchor="bottom"
            >
              <div 
                className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-blue-600 cursor-pointer hover:scale-125 transition-transform"
                onMouseEnter={() => setHoveredPlace(place)}
                onMouseLeave={() => setHoveredPlace(null)}
              >
                {getCategoryIcon(place.properties.category)}
              </div>
            </Marker>
          ))}

          {hoveredMarker && hoveredMarker.coordinates && (
            <Popup
              longitude={hoveredMarker.coordinates[0]} latitude={hoveredMarker.coordinates[1]}
              anchor="bottom" offset={40} closeButton={false} closeOnClick={false} className="z-50"
            >
              <div className="font-bold text-slate-800 text-sm px-1 py-0.5">{hoveredMarker.name}'s Location</div>
            </Popup>
          )}

          {hoveredPlace && (
            <Popup
              longitude={hoveredPlace.geometry.coordinates[0]}
              latitude={hoveredPlace.geometry.coordinates[1]}
              anchor="bottom" offset={35} closeButton={false} closeOnClick={false} className="z-50"
            >
              <div className="p-1 min-w-[150px]">
                <h4 className="font-bold text-slate-900 text-base leading-tight mb-1">{hoveredPlace.properties.name}</h4>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">{hoveredPlace.properties.category.replace(/_/g, ' ')}</p>
                
                {hoveredPlace.properties.website && (
                  <p className="text-xs text-slate-600 truncate mb-1">🌐 {hoveredPlace.properties.website.replace('https://', '')}</p>
                )}
                {hoveredPlace.properties.wheelchair === 'yes' && (
                  <p className="text-xs text-green-600 font-medium">♿ Wheelchair Accessible</p>
                )}
              </div>
            </Popup>
          )}

        </Map>

        {/* Legend */}
        {individualPolygons.length > 0 && (
          <div className="absolute bottom-8 right-8 z-10 flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
              {isLegendOpen ? (
                <div className="bg-white/95 backdrop-blur-sm p-5 rounded-2xl shadow-xl border border-slate-200 w-64 relative animate-in fade-in zoom-in-95 duration-200">
                  <button onClick={() => setIsLegendOpen(false)} className="absolute top-3 right-4 text-slate-400 hover:text-slate-700 transition"><span className="text-xl font-bold leading-none">&times;</span></button>
                  <h3 className="font-extrabold text-slate-800 mb-3 border-b border-slate-100 pb-2">Map Legend</h3>
                  <div className="space-y-3">
                    {people.map((person, i) => (
                      person.coordinates && individualPolygons[i] && (
                        <div key={person.id} className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-md border border-slate-300 shadow-inner" style={{ backgroundColor: colors[i], opacity: 0.6 }}></div>
                          <span className="text-slate-600 text-sm font-medium">{person.name} <span className="text-slate-400 text-xs">({travelTime}m {person.mode === 'driving' ? 'Drive' : 'Transit'})</span></span>
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
                    <div className="mt-2 pt-3 border-t border-slate-100 flex items-center gap-3">
                      <div className="text-lg">📍</div>
                      {/* Updated Legend text to reflect how many are shown */}
                      <span className="text-slate-900 text-sm font-bold">{displayedPlaces.length} of {foundPlaces.length} Places Shown</span>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setIsLegendOpen(true)} className="bg-white/95 backdrop-blur-sm px-4 py-3 rounded-xl shadow-lg border border-slate-200 text-slate-700 font-bold hover:bg-blue-50 transition hover:shadow-xl animate-in fade-in zoom-in-95">🗺️ Show Legend</button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}