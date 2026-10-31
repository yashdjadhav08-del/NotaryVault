import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { DocumentProvider } from './context/DocumentContext';
import { AuthorProvider } from './context/AuthorContext';
import { ToastContainer } from './components/ui/Toast';

// Pages
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentLibraryPage } from './pages/DocumentLibraryPage';
import { RegisterDocumentPage } from './pages/RegisterDocumentPage';
import { DocumentDetailsPage } from './pages/DocumentDetailsPage';
import { VerifyDocumentPage } from './pages/VerifyDocumentPage';
import { SharedDocumentsPage } from './pages/SharedDocumentsPage';
import { ActivityHistoryPage } from './pages/ActivityHistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { QRVerificationPage } from './pages/QRVerificationPage';
import { ApplyAuthorPage } from './pages/ApplyAuthorPage';
import { AuthorApplicationsPage } from './pages/AuthorApplicationsPage';
import { AuthorManagementPage } from './pages/AuthorManagementPage';
import { NotFoundPage } from './pages/NotFoundPage';

import { useWallet } from './context/WalletContext';

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// Route Guard: Requires Author status (Secondary Author or Super Author)
function RequireAuthorRoute({ children }: { children: React.ReactNode }) {
  const { isAuthor, status } = useWallet();
  if (status !== 'connecting' && !isAuthor) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

// Route Guard: Requires Super Author status
function RequireSuperAuthorRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAuthor, status } = useWallet();
  if (status !== 'connecting' && !isSuperAuthor) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <WalletProvider>
      <DocumentProvider>
        <AuthorProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              {/* Public Landing Page */}
              <Route path="/" element={<LandingPage />} />

              {/* Public Verification Portal */}
              <Route path="/verify" element={<QRVerificationPage />} />
              <Route path="/verify/:documentId" element={<QRVerificationPage />} />

              {/* In-App Pages */}
              <Route path="/app" element={<DashboardPage />} />
              <Route path="/app/documents" element={<DocumentLibraryPage />} />
              <Route path="/app/documents/:id" element={<DocumentDetailsPage />} />
              <Route 
                path="/app/register" 
                element={
                  <RequireAuthorRoute>
                    <RegisterDocumentPage />
                  </RequireAuthorRoute>
                } 
              />
              <Route path="/app/verify" element={<VerifyDocumentPage />} />
              <Route 
                path="/app/shared" 
                element={
                  <RequireAuthorRoute>
                    <SharedDocumentsPage />
                  </RequireAuthorRoute>
                } 
              />
              <Route path="/app/activity" element={<ActivityHistoryPage />} />
              <Route path="/app/settings" element={<SettingsPage />} />

              {/* Author Role & Management Pages */}
              <Route path="/app/apply-author" element={<ApplyAuthorPage />} />
              <Route 
                path="/app/author-applications" 
                element={
                  <RequireSuperAuthorRoute>
                    <AuthorApplicationsPage />
                  </RequireSuperAuthorRoute>
                } 
              />
              <Route 
                path="/app/authors" 
                element={
                  <RequireAuthorRoute>
                    <AuthorManagementPage />
                  </RequireAuthorRoute>
                } 
              />

              {/* 404 Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>

            {/* Global Toast Notifications */}
            <ToastContainer />
          </BrowserRouter>
        </AuthorProvider>
      </DocumentProvider>
    </WalletProvider>
  );
}

export default App;
