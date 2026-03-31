import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import * as turf from '@turf/turf';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function MapView() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedCategories = location.state?.categories || [];
  
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
  const ORS_TOKEN = import.meta.env.VITE_ORS_TOKEN;

  const categoryText = selectedCategories.length > 0 
    ? selectedCategories.map(cat => cat.replace(/_/g, ' ')).join(', ') 
    : 'places';

  const [people, setPeople] = useState([
    { id: 1, name: 'Person A', address: '', mode: 'driving', coordinates: null, suggestions: [] },
    { id: 2, name: 'Person B', address: '', mode: 'driving', coordinates: null, suggestions: [] }
  ]);

  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [intersectionPoly, setIntersectionPoly] = useState(null);

  const addPerson = () => {
    if (people.length >= 5) return; 
    const newId = people.length > 0 ? Math.max(...people.map(p => p.id)) + 1 : 1;
    setPeople([...people, { 
      id: newId, 
      name: `Person ${String.fromCharCode(65 + people.length)}`, 
      address: '', 
      mode: 'driving',
      coordinates: null,
      suggestions: []
    }]);
  };

  const removePerson = (idToRemove) => {
    if (people.length <= 2) return;
    setPeople(people.filter(person => person.id !== idToRemove));
    setIntersectionPoly(null);
  };

  const updatePerson = (id, field, value) => {
    setPeople(people.map(person => 
      person.id === id ? { ...person, [field]: value } : person
    ));
    setIntersectionPoly(null);
  };

  const handleAddressChange = async (id, text) => {
    setPeople(people.map(person => 
      person.id === id ? { ...person, address: text, coordinates: null } : person
    ));
    setErrorMsg('');
    setIntersectionPoly(null);

    if (text.length > 2) {
      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json`;
        const params = new URLSearchParams({
          access_token: MAPBOX_TOKEN,
          proximity: '-123.1,49.25',
          autocomplete: 'true',
          limit: 4
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

  const selectSuggestion = (id, feature) => {
    setPeople(people.map(person => 
      person.id === id ? { 
        ...person, 
        address: feature.place_name,
        coordinates: feature.center,
        suggestions: []
      } : person
    ));
  };

  const geocodeAddress = async (address) => {
    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
    const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, proximity: '-123.1,49.25', limit: 1 });
    const response = await fetch(`${endpoint}?${params}`);
    const data = await response.json();
    if (data.features && data.features.length > 0) return data.features[0].center;
    throw new Error(`Could not find: ${address}`);
  };

  const getTravelPolygon = async (coordinates, mode) => {
    if (mode === 'driving') {
      const url = `https://api.openrouteservice.org/v2/isochrones/driving-car?api_key=${ORS_TOKEN}&locations=${coordinates[0]},${coordinates[1]}&range=600`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.error) throw new Error("Routing API limit reached or error.");
      return data.features[0]; 
    } else {
      return turf.circle(coordinates, 3, { steps: 64, units: 'kilometers' });
    }
  };

  const handleFindMiddle = async () => {
    setErrorMsg('');
    setIntersectionPoly(null);
    if (people.some(p => !p.address.trim())) {
      setErrorMsg('Please enter an address for everyone first!');
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
        updatedPeople.map(person => getTravelPolygon(person.coordinates, person.mode))
      );

      let overlap = polygons[0];
      for (let i = 1; i < polygons.length; i++) {
        overlap = turf.intersect(turf.featureCollection([overlap, polygons[i]]));
        if (!overlap) break;
      }

      if (!overlap) {
        setErrorMsg("These locations are too far apart! Try expanding the travel time or choosing closer starting points.");
      } else {
        setIntersectionPoly(overlap);
      }

    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 overflow-hidden">
      
      <div className="w-full md:w-[450px] bg-white shadow-xl z-10 flex flex-col">
        <div className="p-6 overflow-y-auto">
          
          <button 
            onClick={() => navigate('/activity')}
            className="flex items-center text-sm font-semibold text-slate-400 hover:text-blue-600 transition-colors mb-3 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform mr-1">←</span> 
            Back to activities
          </button>

          <h2 className="text-2xl font-bold text-slate-800 mb-2 capitalize">Finding {categoryText}</h2>
          <p className="text-sm text-slate-500 mb-6">Enter everyone's starting location.</p>
          
          <div className="space-y-4">
            {people.map((person) => (
              <div key={person.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl relative hover:border-blue-300 transition-colors">
                
                <div className="flex justify-between items-center mb-2">
                  <input 
                    type="text" 
                    value={person.name}
                    onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
                    className="text-sm font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 hover:border-blue-400 focus:outline-none transition px-1 w-1/2"
                  />
                  {people.length > 2 && (
                    <button 
                      onClick={() => removePerson(person.id)}
                      className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50 transition"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex gap-2 relative">
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      placeholder="Search address..." 
                      value={person.address}
                      onChange={(e) => handleAddressChange(person.id, e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" 
                    />
                    
                    {person.suggestions.length > 0 && (
                      <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden z-50">
                        {person.suggestions.map((feature) => (
                          <li 
                            key={feature.id}
                            onClick={() => selectSuggestion(person.id, feature)}
                            className="p-3 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                          >
                            <div className="font-semibold text-slate-900 truncate">{feature.text}</div>
                            <div className="text-xs text-slate-500 truncate">{feature.place_name.replace(`${feature.text}, `, '')}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  
                  <select 
                    value={person.mode}
                    onChange={(e) => updatePerson(person.id, 'mode', e.target.value)}
                    className="p-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer h-10"
                  >
                    <option value="driving">🚗 Drive</option>
                    <option value="transit">🚌 Transit</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          {people.length < 5 && (
            <button 
              onClick={addPerson}
              className="mt-4 w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl font-semibold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition"
            >
              + Add another person
            </button>
          )}

          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-200">
              ⚠️ {errorMsg}
            </div>
          )}

        </div>

        <div className="p-6 border-t border-slate-100 mt-auto">
          <button 
            onClick={handleFindMiddle}
            disabled={isSearching}
            className={`w-full text-white font-bold py-4 rounded-xl transition shadow-md ${
              isSearching ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSearching ? 'Calculating Zone...' : 'Find the Middle'}
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: -123.1, latitude: 49.25, zoom: 10 }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
        >
          {/* THE OVERLAPPING POLYGON */}
          {intersectionPoly && (
            <Source type="geojson" data={intersectionPoly}>
              <Layer 
                id="intersection-layer" 
                type="fill" 
                paint={{
                  'fill-color': '#3b82f6', // Bright Blue
                  'fill-opacity': 0.4,
                  'fill-outline-color': '#1d4ed8' // Darker blue border
                }} 
              />
            </Source>
          )}

          {people.map((person) => (
            person.coordinates && (
              <Marker 
                key={`marker-${person.id}`} 
                longitude={person.coordinates[0]} 
                latitude={person.coordinates[1]}
                anchor="bottom"
              >
                <div className="text-4xl drop-shadow-md cursor-pointer hover:scale-110 transition-transform">
                  {person.mode === 'driving' ? '🚗' : '🚌'}
                </div>
              </Marker>
            )
          ))}
        </Map>
      </div>
      
    </div>
  );
}