// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PublicPage from "./routes/PublicPage";
import LoginPage from "./routes/LoginPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<PublicPage />} />
       
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </Router>
  );
}

export default App;