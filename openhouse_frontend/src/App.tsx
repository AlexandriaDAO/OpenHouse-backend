import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { IdentityProvider } from './lib/ic-use-identity';
import { AuthProvider } from './providers/AuthProvider';
import { ActorProvider } from './providers/ActorProvider';
import { BalanceProvider } from './providers/BalanceProvider';
import { GameBalanceProvider } from './providers/GameBalanceProvider';
import { Layout } from './components/Layout';
import { AdminRoute } from './components/AdminRoute';
import { Home } from './pages/Home';
import { DiceGame } from './pages/dice';
import { PlinkoGame } from './pages/plinko';
import { Crash } from './pages/Crash';
import { RouletteGame } from './pages/roulette';
import { Admin } from './pages/Admin';
import { Wallet } from './pages/Wallet';
import { Liquidity } from './pages/Liquidity';
import { Predict } from './pages/Predict';

function App() {
  return (
    <Router>
      <IdentityProvider>
        <ActorProvider />
        <AuthProvider>
          <BalanceProvider>
            <GameBalanceProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/dice" element={<DiceGame />} />
                  <Route path="/plinko" element={<PlinkoGame />} />
                  <Route path="/crash" element={<AdminRoute><Crash /></AdminRoute>} />
                  <Route path="/roulette" element={<AdminRoute><RouletteGame /></AdminRoute>} />
                  <Route path="/wallet" element={<Wallet />} />
                  <Route path="/liquidity" element={<Liquidity />} />
                  <Route path="/predict" element={<Predict />} />
                  <Route path="/admin" element={<Admin />} />
                </Routes>
              </Layout>
            </GameBalanceProvider>
          </BalanceProvider>
        </AuthProvider>
      </IdentityProvider>
    </Router>
  );
}

export default App;