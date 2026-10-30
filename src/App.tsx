import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
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

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
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
              <Route path="/app/register" element={<RegisterDocumentPage />} />
              <Route path="/app/verify" element={<VerifyDocumentPage />} />
              <Route path="/app/shared" element={<SharedDocumentsPage />} />
              <Route path="/app/activity" element={<ActivityHistoryPage />} />
              <Route path="/app/settings" element={<SettingsPage />} />

              {/* Author Role & Management Pages */}
              <Route path="/app/apply-author" element={<ApplyAuthorPage />} />
              <Route path="/app/author-applications" element={<AuthorApplicationsPage />} />
              <Route path="/app/authors" element={<AuthorManagementPage />} />

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
