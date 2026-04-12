# 📍 Where-2-Meet

Finding a fair place to meet shouldn't be a math problem. **Where-2-Meet** is a geospatial web application designed to find the perfect overlapping travel zone for groups of friends and recommend customized Points of Interest (POIs) within that area. 

By calculating real-time drive, cycle, and transit isochrones (travel-time polygons) for up to 5 different starting locations, the app performs a spatial intersection in the browser to identify the optimal geographic center. It then queries a custom ArcGIS Online REST endpoint to suggest cafes, restaurants, parks, and more that fall strictly within that fair meeting zone.

## ✨ Key Features

* **Live Geocoding & Autocomplete:** Search for any starting address using the ArcGIS World Geocoding Service with live typing suggestions and reverse-geocoding for dropped pins.
* **Isochrone Routing:** Uses OpenRouteService to calculate accurate driving and cycling travel-zone polygons based on real road networks, alongside Turf.js radial fallbacks for transit estimates.
* **In-Browser Spatial Analysis:** Leverages Turf.js to dynamically calculate the geometric intersection of multiple travel zones without needing a backend server.
* **Custom POI Integration:** Queries a hosted ArcGIS Online Feature Layer using spatial relationships (`esriSpatialRelIntersects`) to fetch and render interactive venue data strictly inside the meeting zone.
* **Dynamic Cartography:** Features a modern mapping interface built with the ArcGIS Maps SDK for JavaScript, utilizing next-generation Esri Web Components, smooth UI transitions, and custom Tailwind CSS React tooltips.

## 🛠️ Tech Stack

* **Frontend Framework:** React (Vite)
* **Styling:** Tailwind CSS
* **Mapping Engine:** ArcGIS Maps SDK for JavaScript (`@arcgis/core` & `@arcgis/map-components`)
* **Spatial Analysis:** Turf.js
* **Routing API:** OpenRouteService (v2)
* **Database / Feature Layer:** ArcGIS Online (AGOL) REST API

## 📝 Future Improvements

* Integrate true GTFS public transit routing via a dedicated transit API
* Add a "Share this Meeting Spot" feature to generate unique URL links for groups
* Expand the POI dataset to include more comprehensive venue information and imagery
