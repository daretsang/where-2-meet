import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Activity from './pages/Activity';
import MapView from './pages/MapView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/map" element={<MapView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;