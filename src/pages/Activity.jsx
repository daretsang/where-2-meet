import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Activity() {
  const navigate = useNavigate();
  // State to hold an array of selected category IDs
  const [selected, setSelected] = useState([]);

  const activities = [
    { name: 'Cafes', id: 'cafes', icon: '☕' },
    { name: 'Restaurants', id: 'restaurants', icon: '🍔' },
    { name: 'Parks', id: 'parks', icon: '🌳' },
    { name: 'Museums', id: 'museums', icon: '🏛️' },
    { name: 'Libraries', id: 'libraries', icon: '📚' },
    { name: 'Art Galleries', id: 'art_galleries', icon: '🎨' },
    { name: 'Shopping', id: 'shopping_malls', icon: '🛍️' },
    { name: 'Beaches & Water', id: 'waterbodies', icon: '🏖️' },
    { name: 'Aquariums', id: 'aquarium', icon: '🐠' },
    { name: 'Desserts and Bakeries', id: 'desserts_bakeries', icon: '🍰' },
    { name: 'Gyms & Rec', id: 'recreation_gyms', icon: '🏋️' },
    { name: 'Beauty', id: 'beauty', icon: '💅' },
    { name: 'Dog Parks', id: 'dog_parks', icon: '🐕' },
    { name: 'Nightlife', id: 'nightlife', icon: '🍻' },
    { name: 'Niche Fun', id: 'niche_fun', icon: '🎯' }
  ];

  // Logic to add or remove a category from the selection
  const toggleSelection = (id) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(item => item !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const handleConfirm = () => {
    if (selected.length > 0) {
      navigate('/map', { state: { categories: selected } });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-6 pt-12 pb-24">
      <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-2 text-center">What are the vibes?</h2>
      <p className="text-slate-500 mb-10 text-center">Select one or more activities for your group.</p>
      
      {/* The responsive grid for all the buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full max-w-5xl mb-12">
        {activities.map((act) => {
          const isSelected = selected.includes(act.id);
          return (
            <button
              key={act.id}
              onClick={() => toggleSelection(act.id)}
              className={`p-6 rounded-2xl shadow-sm border-2 flex flex-col items-center transition cursor-pointer ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 hover:bg-blue-100 scale-105' 
                  : 'border-slate-100 bg-white hover:border-blue-300 hover:shadow-md'
              }`}
            >
              <span className="text-4xl mb-3">{act.icon}</span>
              <span className={`font-semibold text-sm text-center ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                {act.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* confirm button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 flex justify-center z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={handleConfirm}
          disabled={selected.length === 0}
          className={`px-8 py-4 rounded-xl font-bold text-lg w-full max-w-md transition shadow-md ${
            selected.length > 0
              ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {selected.length === 0 ? 'Select an activity' : `Continue with ${selected.length} selected`}
        </button>
      </div>
    </div>
  );
}