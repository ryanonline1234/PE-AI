import type { Metadata } from "next";
import { Layout } from "@/components/ui";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Privacy Policy — PE.AI",
  description: "What PE.AI collects, why, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <Layout backHref="/" backLabel="← Home">
      <Prose title="Privacy Policy" updated="October 27, 2026">
        <section>
          <p>
            PE.AI writes personalized workouts for high school PE classes. Teachers set up classes, students sign in and
            enter a class code, and an AI writes each student a workout. It is a student-built project made for PE
            classes at Archbishop Mitty High School. It is not an official school service.
          </p>
        </section>

        <section>
          <h2>Signing in</h2>
          <p>
            Everyone signs in with a Mitty school Google account (@mittymonarch.com or @mitty.com). Google sends us your
            name, school email address, and profile picture. We keep your name, email, and whether you are a student or
            a teacher. Other Google accounts can&apos;t sign in.
          </p>
        </section>

        <section>
          <h2>Students</h2>
          <ul>
            <li><strong>Sent to the AI, not stored:</strong> fitness level, injuries or limitations, preferences, and
              answers to the AI&apos;s quick questions. They are used once to write the workout.</li>
            <li><strong>Stored with your account:</strong> each workout you generate, which class it was for, the
              classes you joined, and your star ratings and comments.</li>
            <li><strong>Personal classes:</strong> if you make your own class, we store its settings and the workouts you
              generate in it. Only you can use it.</li>
            <li><strong>Who sees it:</strong> you see your own workouts. The teacher who owns a class you joined sees your
              name, school email, the workouts you generated in that class, and your ratings and comments for it.
              Teachers never see your personal classes. Anyone you send a workout link to can open that workout after
              signing in.</li>
          </ul>
        </section>

        <section>
          <h2>Teachers</h2>
          <ul>
            <li><strong>Class settings:</strong> duration, calorie target, intensity, focus, equipment, instructions,
              and the AI&apos;s confirmed summary and your answers to its questions.</li>
            <li><strong>Your workouts:</strong> sample workouts you preview, and which classes you file workouts under.</li>
          </ul>
        </section>

        <section>
          <h2>Google user data</h2>
          <p>
            Information received from Google (name, email, profile picture) is used only to sign you in, label your
            workouts, and show a teacher who in their class did which workout. It is never sold, never shared outside
            the uses above, never used for advertising, and never sent to the AI or used to train AI models.
            PE.AI&apos;s use of information received from Google APIs adheres to the{" "}
            <a className="text-accent" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>.
          </p>
        </section>

        <section>
          <h2>Who processes the data</h2>
          <ul>
            <li><strong>Anthropic</strong> (Claude) receives the workout request described above, with no name or email,
              and the day&apos;s anonymous comments for a teacher&apos;s report.</li>
            <li><strong>Supabase</strong> stores the database and handles sign-in.</li>
            <li><strong>Google</strong> confirms your school account when you sign in.</li>
            <li><strong>Vercel</strong> hosts the site and counts anonymous page views.</li>
          </ul>
          <p>
            To stop abuse, the site counts requests per account, per network address, and per class code. Those counters
            are deleted after about two days.
          </p>
        </section>

        <section>
          <h2>Keeping and deleting data</h2>
          <p>
            Accounts, workouts, ratings, and class settings are kept until someone asks for them to be deleted. Students
            can ask their PE teacher, and anyone can ask the developer through the support contact shown on
            Google&apos;s sign-in screen. We will delete your account and everything linked to it on request.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>If this policy changes, the date at the top changes with it.</p>
        </section>
      </Prose>
    </Layout>
  );
}
