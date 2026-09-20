import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Display, Kicker, Numeral } from '@/components/ui/primitives';
import { Wordmark } from '@/components/layout/app-shell';
import { getCurrentUser } from '@/lib/auth/session';

const PILLARS = [
  {
    index: '01',
    title: 'The clock is the server',
    body: 'Every round opens and closes on the server. Response time is measured the moment your answer lands, so a fast laptop never beats a fast mind.',
  },
  {
    index: '02',
    title: 'Speed is worth points',
    body: 'A correct answer pays base points plus a speed bonus that drains with the clock. Streaks stack on top. Hesitation is expensive.',
  },
  {
    index: '03',
    title: 'The board moves between rounds',
    body: 'Standings recompute the instant a round closes, with rank movement, a personal recap and a podium that means something.',
  },
  {
    index: '04',
    title: 'Nothing leaks',
    body: 'Answers lock on submit, duplicates are impossible, and the answer key never reaches a browser while the round is open.',
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  const home = user?.role === 'ADMIN' ? '/admin' : '/dashboard';

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[80vh] grid-field" aria-hidden />

      <header className="container relative flex h-16 items-center justify-between">
        <Wordmark />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href={home}>
              <Button size="md">Open arena</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="md">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button size="md">Compete</Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="container relative">
        {/* --- hero ---------------------------------------------------- */}
        <section className="py-12 sm:py-20">
          <Kicker tone="volt">Live competitive tournaments</Kicker>

          <Display size="mega" as="h1" className="mt-4 max-w-4xl">
            Answer fast.
            <br />
            Climb the board.
            <br />
            <span className="text-volt">Win the arena.</span>
          </Display>

          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-smoke sm:text-[17px]">
            Host a tournament where everyone sees the same question at the same instant, the clock
            runs on the server, and the rankings move the moment a round closes.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={user ? '/join' : '/register'} className="sm:w-56">
              <Button size="xl" block>
                {user ? 'Enter a code' : 'Join a battle'}
              </Button>
            </Link>
            <Link href={user?.role === 'ADMIN' ? '/admin/tournaments/create' : '/login'} className="sm:w-56">
              <Button size="xl" variant="steel" block>
                Host one
              </Button>
            </Link>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
            {[
              { label: 'Question types', value: '5' },
              { label: 'Timing source', value: 'Server' },
              { label: 'Board lag', value: '<1s' },
              { label: 'Badges', value: '7' },
            ].map((stat) => (
              <div key={stat.label} className="bg-deck px-4 py-5">
                <Numeral value={stat.value} label={stat.label} size="lg" tone="volt" />
              </div>
            ))}
          </div>
        </section>

        {/* --- pillars ------------------------------------------------- */}
        <section className="border-t border-rail py-14">
          <div className="grid gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-2">
            {PILLARS.map((pillar) => (
              <article key={pillar.index} className="bg-deck p-6 sm:p-7">
                <span className="font-data text-kicker text-volt">{pillar.index}</span>
                <h2 className="display mt-3 text-[1.5rem] leading-none text-chalk">
                  {pillar.title}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-smoke">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* --- closer -------------------------------------------------- */}
        <section className="border-t border-rail py-16 text-center">
          <Display size="xl" className="mx-auto max-w-2xl">
            Built for the room,
            <br />
            not the spreadsheet
          </Display>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-smoke">
            University heats, hackathon finals, corporate off-sites, maths leagues. Anywhere a crowd
            wants to find out who is quickest.
          </p>
          <Link href={user ? home : '/register'} className="mt-8 inline-block">
            <Button size="xl" className="px-12">
              {user ? 'Open arena' : 'Create your profile'}
            </Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-rail py-8">
        <div className="container flex flex-col items-center justify-between gap-2 sm:flex-row">
          <Kicker>Clash Arena</Kicker>
          <Kicker>
            Demo host · <span className="text-smoke">admin@clasharena.dev</span>
          </Kicker>
        </div>
      </footer>
    </div>
  );
}
