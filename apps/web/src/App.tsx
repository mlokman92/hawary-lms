import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import { ThemeProvider } from './lib/theme'
import { AuthProvider } from './lib/auth'
import { AcademyProvider } from './lib/academy'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { ForgotPassword } from './pages/ForgotPassword'
import { AuthCallback } from './pages/AuthCallback'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { CoursesPage } from './pages/CoursesPage'
import { StudentsPage } from './pages/StudentsPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { NotesPage } from './pages/NotesPage'
import { AssessmentsPage } from './pages/AssessmentsPage'
import { AssessmentEditorPage } from './pages/AssessmentEditorPage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { AssignmentEditorPage } from './pages/AssignmentEditorPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AcademyProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/forgot" element={<ForgotPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="/courses" element={<CoursesPage />} />
                  <Route path="/students" element={<StudentsPage />} />
                  <Route path="/students/:id" element={<StudentDetailPage />} />
                  <Route path="/notes" element={<NotesPage />} />
                  <Route path="/assessments" element={<AssessmentsPage />} />
                  <Route
                    path="/assessments/:id"
                    element={<AssessmentEditorPage />}
                  />
                  <Route path="/assignments" element={<AssignmentsPage />} />
                  <Route
                    path="/assignments/:id"
                    element={<AssignmentEditorPage />}
                  />
                  <Route path="/payments" element={<PaymentsPage />} />
                  <Route path="/payments/:id" element={<InvoiceDetailPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AcademyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
