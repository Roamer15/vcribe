import { Link, Route, Routes } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Display from './Display';
import Speak from './Speak';

function Home() {
  return (
    <main className="home">
      <div className="home-inner screen">
        <h1>Vcribe</h1>
        <p className="home-sub">Live captions for every classroom.</p>

        <nav className="home-list" aria-label="Choose a screen">
          <Link to="/display" className="home-row">
            <span>
              <span className="home-row-title">Show captions</span>
              <span className="home-row-sub">On a TV or computer</span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
          <Link to="/speak" className="home-row">
            <span>
              <span className="home-row-title">Start speaking</span>
              <span className="home-row-sub">On the teacher’s phone</span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/display" element={<Display />} />
      <Route path="/speak" element={<Speak />} />
    </Routes>
  );
}