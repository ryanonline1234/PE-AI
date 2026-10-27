import type { Metadata } from "next";
import { Layout } from "@/components/ui";
import { Prose } from "@/components/Prose";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use — PE.AI",
  description: "The ground rules for using PE.AI.",
};

export default function TermsPage() {
  return (
    <Layout backHref="/" backLabel="← Home">
      <Prose title="Terms of Use" updated="October 26, 2026">
        <section>
          <p>
            PE.AI is a free, student-built tool for PE classes. By using it you agree to these terms.
          </p>
        </section>

        <section>
          <h2>Workouts are suggestions</h2>
          <ul>
            <li>Workouts are written by an AI and can be wrong. They are not medical advice.</li>
            <li>Your teacher&apos;s instructions come first. Follow them over anything the app says.</li>
            <li>Stop if something hurts. If you have an injury or a medical condition, check with your teacher,
              school nurse, or doctor before doing a workout.</li>
          </ul>
        </section>

        <section>
          <h2>Use it fairly</h2>
          <ul>
            <li>Use class codes only for classes you belong to or teach.</li>
            <li>Don&apos;t try to break, overload, or misuse the site or its AI.</li>
            <li>Don&apos;t put anyone else&apos;s private information in the text boxes.</li>
          </ul>
        </section>

        <section>
          <h2>No guarantees</h2>
          <p>
            PE.AI is provided as is. It may change, pause, or stop, and features may be added or removed. It is not
            an official Archbishop Mitty High School service.
          </p>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            What the app collects and how to have it deleted is in the{" "}
            <Link className="text-accent" href="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </Prose>
    </Layout>
  );
}
