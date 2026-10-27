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
      <Prose title="Privacy Policy" updated="October 26, 2026">
        <section>
          <p>
            PE.AI writes personalized workouts for high school PE classes. A teacher sets up a class, students
            enter a class code, and an AI writes each student a workout. It is a student-built project made for
            PE classes at Archbishop Mitty High School. It is not an official school service.
          </p>
        </section>

        <section>
          <h2>Students</h2>
          <p>Students do not create accounts and are never asked for an email address or last name.</p>
          <ul>
            <li><strong>Sent to the AI, not stored:</strong> fitness level, injuries or limitations, preferences, and
              answers to the AI&apos;s quick questions. These are used once to write the workout.</li>
            <li><strong>Stored:</strong> the generated workout, the class code, and the first name if the student
              typed one. This is what makes the workout&apos;s share link work.</li>
            <li><strong>Stored:</strong> star ratings and comments, with the optional first name, so the teacher can
              see how the class went.</li>
          </ul>
        </section>

        <section>
          <h2>Teachers</h2>
          <ul>
            <li><strong>Class settings:</strong> duration, calorie target, intensity, focus, equipment, instructions,
              and the AI&apos;s confirmed summary and the teacher&apos;s answers to its questions.</li>
            <li><strong>Teacher key:</strong> stored only as a one-way hash; we cannot read it.</li>
            <li><strong>Google sign-in:</strong> when a teacher signs in with Google we receive their name, school
              email address, and profile picture. We use them only to sign the teacher in and to show which classes
              are theirs. Only Mitty school accounts can sign in.</li>
          </ul>
        </section>

        <section>
          <h2>Google user data</h2>
          <p>
            Information received from Google is used only to sign you in and identify your classes. It is never
            sold, never shared with anyone else, never used for advertising, and never sent to the AI or used to
            train AI models. PE.AI&apos;s use of information received from Google APIs adheres to the{" "}
            <a className="text-accent" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>.
          </p>
        </section>

        <section>
          <h2>Who processes the data</h2>
          <ul>
            <li><strong>Anthropic</strong> (Claude) receives the workout request text described above and the
              day&apos;s ratings and comments for the teacher&apos;s report.</li>
            <li><strong>Supabase</strong> stores the database.</li>
            <li><strong>Vercel</strong> hosts the site and counts anonymous page views.</li>
          </ul>
          <p>
            To stop abuse, the site counts requests per network address and per class code. Those counters are
            deleted after about two days.
          </p>
        </section>

        <section>
          <h2>Keeping and deleting data</h2>
          <p>
            Workouts, ratings, and class settings are kept until someone asks for them to be deleted. Students can
            ask their PE teacher, and teachers can ask the developer through the support contact shown on
            Google&apos;s sign-in screen. We will delete the class, its workouts, its ratings, and any teacher
            account on request.
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
