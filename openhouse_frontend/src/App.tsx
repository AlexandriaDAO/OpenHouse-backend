import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { IdentityProvider } from './lib/ic-use-identity';
import { AuthProvider } from './providers/AuthProvider';
import { ActorProvider } from './providers/ActorProvider';
import { BalanceProvider } from './providers/BalanceProvider';
import { GameBalanceProvider } from './providers/GameBalanceProvider';
import { Layout } from './components/Layout';
import { AdminRoute } from './components/AdminRoute';
import { Home } from './pages/Home';
import { DiceLayout, DiceGame, DiceLiquidity } from './pages/dice';
import { PlinkoLayout, PlinkoGame, PlinkoLiquidity } from './pages/plinko';
import { Crash } from './pages/Crash';
import { BlackjackLayout, BlackjackGame, BlackjackLiquidity } from './pages/blackjack';
import { Admin } from './pages/Admin';
import { Wallet } from './pages/Wallet';

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
                  
                  <Route path="/dice" element={<DiceLayout />}>
                    <Route index element={<DiceGame />} />
                    <Route path="liquidity" element={<DiceLiquidity />} />
                  </Route>
                  
                  <Route path="/plinko" element={<AdminRoute><PlinkoLayout /></AdminRoute>}>
                    <Route index element={<PlinkoGame />} />
                    <Route path="liquidity" element={<PlinkoLiquidity />} />
                  </Route>

                  <Route path="/crash" element={<AdminRoute><Crash /></AdminRoute>} />

                  <Route path="/blackjack" element={<AdminRoute><BlackjackLayout /></AdminRoute>}>
                    <Route index element={<BlackjackGame />} />
                    <Route path="liquidity" element={<BlackjackLiquidity />} />
                  </Route>
                  
                  <Route path="/wallet" element={<Wallet />} />
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