import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import { ActorProvider } from './providers/ActorProvider';
import { BalanceProvider } from './providers/BalanceProvider';
import { GameBalanceProvider } from './providers/GameBalanceProvider';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Crash } from './pages/Crash';
import { Plinko } from './pages/Plinko';
import { Blackjack } from './pages/Blackjack';
import { DiceLayout, DiceGame, DiceLiquidity } from './pages/dice';

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
                  <Route path="/blackjack" element={<Blackjack />} />
                  <Route path="/dice" element={<DiceLayout />}>
                    <Route index element={<DiceGame />} />
                    <Route path="liquidity" element={<DiceLiquidity />} />
                  </Route>
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
