import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import { ActorProvider } from './providers/ActorProvider';
import { BalanceProvider } from './providers/BalanceProvider';
import { GameBalanceProvider } from './providers/GameBalanceProvider';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Crash } from './pages/Crash';
import { Plinko } from './pages/Plinko';
import { PlinkoMotoko } from './pages/PlinkoMotoko';
import { Mines } from './pages/Mines';
import { Dice } from './pages/Dice';

function App() {
  return (
    <Router>
      <AuthProvider>
        <ActorProvider>
          <BalanceProvider>
            <GameBalanceProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/crash" element={<Crash />} />
                  <Route path="/plinko" element={<Plinko />} />
                  <Route path="/plinko-motoko" element={<PlinkoMotoko />} />
                  <Route path="/mines" element={<Mines />} />
                  <Route path="/dice" element={<Dice />} />
                </Routes>
              </Layout>
            </GameBalanceProvider>
          </BalanceProvider>
        </ActorProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
