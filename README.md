# 📍 Where-2-Meet

Finding a fair place to meet shouldn't be a math problem. **Where-2-Meet** is a geospatial web application designed to find the perfect overlapping travel zone for groups of friends and recommend customized Points of Interest (POIs) within that area. 

By calculating real-time drive and transit isochrones (travel-time polygons) for up to 5 different starting locations, the app performs a spatial intersection in the browser to identify the optimal geographic center. It then queries a custom ArcGIS Online REST endpoint to suggest cafes, restaurants, parks, and more that fall strictly within that fair meeting zone.

## ✨ Key Features

* **Live Geocoding & Autocomplete:** Search for any starting address using the Mapbox Geocoding API with live typing suggestions.
* **Isochrone Routing:** Uses OpenRouteService to calculate accurate driving travel-zone polygons based on real road networks and a user-defined max travel time (5 - 30 minutes).
* **In-Browser Spatial Analysis:** Leverages Turf.js to dynamically calculate the geometric intersection of multiple travel zones without needing a backend server.
* **Custom POI Integration:** Queries a hosted ArcGIS Online Feature Layer using spatial relationships (`esriSpatialRelIntersects`) to fetch and render interactive venue data inside the meeting zone.
* **Dynamic Cartography:** Interactive Mapbox GL JS map featuring dynamic legends, interactive hover states, and smooth UI transitions built with React and Tailwind CSS.

## 🛠️ Tech Stack

* **Frontend Framework:** React (Vite)
* **Styling:** Tailwind CSS
* **Mapping Engine:** Mapbox GL JS (`react-map-gl`)
* **Spatial Analysis:** Turf.js
* **Routing API:** OpenRouteService (v2)
* **Database / Feature Layer:** ArcGIS Online (AGOL) REST API

## 📝 Future Improvements

* Integrate public transit routing
* Add a "Share this Meeting Spot" feature to generate unique links for groups
* Expand the dataset to include more information