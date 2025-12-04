import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

const ADMIN_PRINCIPAL = 'p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { principal, isInitializing } = useAuth();

  const isAdmin = principal === ADMIN_PRINCIPAL;

  // While initializing, render children optimistically (allows data fetching to start)
  // Only redirect once we've confirmed user is NOT admin
  if (!isInitializing && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
