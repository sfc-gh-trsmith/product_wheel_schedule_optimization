import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ExecutiveOverview from './pages/ExecutiveOverview';
import DataExplorer from './pages/DataExplorer';
import OptimizationResults from './pages/OptimizationResults';
import ScenarioStudio from './pages/ScenarioStudio';
import ContractMonitor from './pages/ContractMonitor';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<ExecutiveOverview />} />
        <Route path="/explorer" element={<DataExplorer />} />
        <Route path="/results" element={<OptimizationResults />} />
        <Route path="/studio" element={<ScenarioStudio />} />
        <Route path="/contracts" element={<ContractMonitor />} />
      </Route>
    </Routes>
  );
}
