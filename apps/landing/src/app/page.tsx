import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-7 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Hawary <span className="text-primary">LMS</span>
        </h1>
        <p className="text-muted-foreground text-[1.0625rem] leading-relaxed">
          The learning management system built for Malaysian academies —
          courses, students, assessments and payments in one place.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline" size="lg">
            <a href="https://app.hawary.my/signin">Log in</a>
          </Button>
          <Button asChild size="lg">
            <a href="https://app.hawary.my/signup">Sign up</a>
          </Button>
        </div>
      </div>
    </main>
  )
}
