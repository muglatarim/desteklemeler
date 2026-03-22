import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { AdminConverter } from './pages/AdminConverter';

function App() {
    return (
        <div className="App">
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/admin" element={<AdminConverter />} />
            </Routes>
        </div>
    );
}

export default App;
