import LoginPage from "./app/login/page"
import HomePage from "./app/home/page"
import { HashRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.scss';
import MapPage from "./app/map/page";


export default function App() {
  return (
    <Router>
      <div className="app-container">
        
        <nav className="nav-bar">
          <ul className="nav-list">
            <li className="nav-item">
              <Link to="/">Home</Link>
            </li>
            <li className="nav-item">
              <Link to="/map">Map</Link>
            </li>
            <li className="nav-item">
              <Link to="/login">Login</Link>
            </li>
          </ul>
        </nav>




        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
