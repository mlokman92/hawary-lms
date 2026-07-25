import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function Dashboard() {
  const { user, signOut } = useAuth()
  const { memberships, active, activeAcademyId, setActiveAcademyId } =
    useAcademy()

  return (
    <div className="min-h-svh">
      <header className="bg-card flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="font-bold tracking-tight">
          Hawary <span className="text-primary">LMS</span>
        </div>
        <div className="flex items-center gap-3">
          {memberships.length > 1 ? (
            <Select
              value={activeAcademyId ?? undefined}
              onValueChange={setActiveAcademyId}
            >
              <SelectTrigger size="sm" className="w-[200px]">
                <SelectValue placeholder="Academy" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.academyId} value={m.academyId}>
                    {m.academy?.name ?? m.academyId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {user?.email}
          </span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {active?.academy?.name ?? 'Your academy'}
            </CardTitle>
            <CardDescription>
              You are {active?.role ?? 'a member'}
              {active?.academy ? ` of ${active.academy.name}` : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              This is the admin dashboard shell. Notes, courses, enrollment,
              assessments, and billing screens land here next.
            </p>
            <Button asChild variant="outline">
              <Link to="/onboarding">Create another academy</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
