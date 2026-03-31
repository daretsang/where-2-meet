import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 text-center mb-4 tracking-tight">
        Meet in the Middle
      </h1>
      <p className="text-lg text-slate-600 text-center mb-8 max-w-md">
        Find the perfect halfway point for you and your friends to hang out, whether you're driving or taking transit.
      </p>
      <Link
        to="/activity"
        className="bg-blue-600 text-white px-8 py-3 rounded-full font-semibold text-lg hover:bg-blue-700 transition shadow-lg hover:shadow-xl"
      >
        Get Started
      </Link>
    </div>
  );
}