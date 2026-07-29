import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import { ThemeProvider } from './lib/theme'
import { LanguageProvider } from './lib/i18n'
import { TooltipProvider } from './components/ui/tooltip'
import { AuthProvider } from './lib/auth'
import { AcademyProvider } from './lib/academy'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PendingInviteRedirect } from './components/PendingInviteRedirect'
import { AppShell } from './components/AppShell'
import { StudentShell } from './components/StudentShell'
import { LearnDashboardPage } from './pages/learn/LearnDashboardPage'
import { LearnHomePage } from './pages/learn/LearnHomePage'
import { LearnWorkPage } from './pages/learn/LearnWorkPage'
import { LearnCoursePage } from './pages/learn/LearnCoursePage'
import { LearnNotePage } from './pages/learn/LearnNotePage'
import { LearnAssignmentPage } from './pages/learn/LearnAssignmentPage'
import { LearnAssessmentPage } from './pages/learn/LearnAssessmentPage'
import { LearnBillingPage } from './pages/learn/LearnBillingPage'
import { LearnInvoicePage } from './pages/learn/LearnInvoicePage'
import { LearnProfilePage } from './pages/learn/LearnProfilePage'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { AuthCallback } from './pages/AuthCallback'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { CoursesPage } from './pages/CoursesPage'
import { CourseDetailPage } from './pages/CourseDetailPage'
import { CourseGradingPage } from './pages/CourseGradingPage'
import { GradeSubmissionPage } from './pages/GradeSubmissionPage'
import { GradeAttemptPage } from './pages/GradeAttemptPage'
import { StudentsPage } from './pages/StudentsPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { InstructorsPage } from './pages/InstructorsPage'
import { InstructorDetailPage } from './pages/InstructorDetailPage'
import { NoteEditorPage } from './pages/NoteEditorPage'
import { AssessmentEditorPage } from './pages/AssessmentEditorPage'
import { AssignmentEditorPage } from './pages/AssignmentEditorPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { MembersPage } from './pages/MembersPage'
import { PublicPayPage } from './pages/PublicPayPage'
import { PayResultPage } from './pages/PayResultPage'

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      {/* Outside the router on purpose: the language is a device preference,
          not route state, and every tree — auth, back-office, learner — reads
          it. */}
      <LanguageProvider>
      {/* SidebarProvider used to supply this; upstream moved it out, so every
          tooltip (sidebar rail included) needs a provider at the root. */}
      <TooltipProvider delayDuration={0}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AcademyProvider>
              <BrowserRouter>
                <PendingInviteRedirect />
                <Routes>
                  <Route path="/signin" element={<SignIn />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route path="/forgot" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/accept-invite" element={<AcceptInvitePage />} />
                  <Route path="/pay/:token" element={<PublicPayPage />} />
                  <Route path="/pay/:token/result" element={<PayResultPage />} />
                  <Route
                    path="/onboarding"
                    element={
                      <ProtectedRoute>
                        <Onboarding />
                      </ProtectedRoute>
                    }
                  />
                  {/* Legacy landing: the student experience is /learn now. */}
                  <Route path="/student" element={<Navigate to="/learn" replace />} />
                  <Route
                    element={
                      <ProtectedRoute>
                        <StudentShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/learn" element={<LearnDashboardPage />} />
                    <Route path="/learn/courses" element={<LearnHomePage />} />
                    <Route path="/learn/work" element={<LearnWorkPage />} />
                    <Route path="/learn/courses/:id" element={<LearnCoursePage />} />
                    <Route path="/learn/notes/:id" element={<LearnNotePage />} />
                    <Route
                      path="/learn/assignments/:id"
                      element={<LearnAssignmentPage />}
                    />
                    <Route
                      path="/learn/assessments/:id"
                      element={<LearnAssessmentPage />}
                    />
                    <Route path="/learn/billing" element={<LearnBillingPage />} />
                    <Route
                      path="/learn/billing/:id"
                      element={<LearnInvoicePage />}
                    />
                    <Route path="/learn/profile" element={<LearnProfilePage />} />
                    {/* In-tree catch-all. Without it an unknown /learn/* URL hits
                        the global '*' below, which sends it to '/' — and AppShell
                        bounces a student straight back to /learn. */}
                    <Route
                      path="/learn/*"
                      element={<Navigate to="/learn" replace />}
                    />
                  </Route>
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="/courses" element={<CoursesPage />} />
                    <Route path="/courses/:id" element={<CourseDetailPage />} />
                    <Route
                      path="/courses/:id/grading"
                      element={<CourseGradingPage />}
                    />
                    <Route
                      path="/grading/submissions/:id"
                      element={<GradeSubmissionPage />}
                    />
                    <Route path="/grading/attempts/:id" element={<GradeAttemptPage />} />
                    <Route path="/students" element={<StudentsPage />} />
                    <Route path="/students/:id" element={<StudentDetailPage />} />
                    <Route path="/instructors" element={<InstructorsPage />} />
                    <Route
                      path="/instructors/:id"
                      element={<InstructorDetailPage />}
                    />
                    {/* Content is reached from its course; these stay routable so
                        deep links and the editors' own URLs keep working. */}
                    <Route path="/notes/:id" element={<NoteEditorPage />} />
                    <Route
                      path="/assessments/:id"
                      element={<AssessmentEditorPage />}
                    />
                    <Route
                      path="/assignments/:id"
                      element={<AssignmentEditorPage />}
                    />
                    <Route path="/payments" element={<PaymentsPage />} />
                    <Route path="/payments/:id" element={<InvoiceDetailPage />} />
                    <Route path="/members" element={<MembersPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
              </AcademyProvider>
            </AuthProvider>
        </QueryClientProvider>
      </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
