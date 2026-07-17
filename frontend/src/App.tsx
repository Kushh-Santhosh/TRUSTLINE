import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DisputeDemoPage from './pages/DisputeDemoPage';
import AttackDemoPage from './pages/AttackDemoPage';
import PhishingCloneDemoPage from './pages/PhishingCloneDemoPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/demo/dispute" element={<DisputeDemoPage />} />
        <Route path="/demo/attack" element={<AttackDemoPage />} />
        <Route path="/demo/phishing-clone" element={<PhishingCloneDemoPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
