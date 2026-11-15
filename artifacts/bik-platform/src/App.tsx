import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
const Welcome = lazy(() => import('./pages/Welcome'))
const SectorSelect = lazy(() => import('./pages/SectorSelect'))
const DiagnosticDepth = lazy(() => import('./pages/DiagnosticDepth'))
const CompanyIntake = lazy(() => import('./pages/CompanyIntake'))
const Questionnaire = lazy(() => import('./pages/Questionnaire'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const Processing = lazy(() => import('./pages/Processing'))
const LeadGate = lazy(() => import('./pages/LeadGate'))
const ReportTransfer = lazy(() => import('./pages/ReportTransfer'))
const Report = lazy(() => import('./pages/Report'))
const Consultant = lazy(() => import('./pages/Consultant'))
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  return (
    <BrowserRouter>
      <div dir="rtl" lang="ar" className="min-h-screen font-arabic">
        <ErrorBoundary>
          <Suspense fallback={<main className="grid min-h-[100dvh] place-items-center bg-[#F4F1E9] text-[#0F172A]" dir="rtl" lang="ar"><p role="status">جارٍ تحميل صفحة BIK…</p></main>}>
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/sector-select" element={<SectorSelect />} />
              <Route path="/diagnostic-depth" element={<DiagnosticDepth />} />
              <Route path="/company-intake" element={<CompanyIntake />} />
              <Route path="/questionnaire" element={<Questionnaire />} />
              <Route path="/review/:page" element={<ReviewPage />} />
              <Route path="/processing" element={<Processing />} />
              <Route path="/lead-gate" element={<LeadGate />} />
              <Route path="/report-transfer" element={<ReportTransfer />} />
              <Route path="/report" element={<Report />} />
              <Route path="/consultant" element={<Consultant />} />
              <Route path="/admin" element={<Navigate to="/" replace />} />
              <Route path="/admin-bik-dashboard-2025" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  )
}

export default App
