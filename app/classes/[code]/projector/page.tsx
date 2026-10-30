import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { ProjectorControls } from "@/components/teacher/ProjectorControls";
import { getAccount } from "@/lib/supabase-auth";
import { schoolDate } from "@/lib/time";
import { classLabel, loadClass, loadSession } from "@/lib/teacher-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projector — PE.AI", robots: { index: false } };

type Params = Promise<{ code: string }>;

// Projector mode (docs/04 T2): the class code huge, with a QR code students
// scan to open /c/CODE (sign-in first, then straight to the class). Owner only.
export default async function ProjectorPage({ params }: { params: Params }) {
  const code = (await params).code.toUpperCase();
  const account = await getAccount();
  if (!account) redirect(`/login?next=/classes/${code}/projector`);
  const cls = await loadClass(code);
  if (!cls || cls.owner_id !== account.id || cls.kind !== "class") notFound();
  const session = await loadSession(cls.id, schoolDate());

  const h = await headers();
  const host = h.get("host") ?? "pe-ai.vercel.app";
  const link = `${h.get("x-forwarded-proto") ?? "https"}://${host}/c/${code}`;
  // Dark modules on white with a quiet zone: the most reliable thing to scan off a projector.
  const qr = await QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#0a0a0f", light: "#ffffff" } });

  return (
    <div className="min-h-screen flex flex-col px-6 py-6">
      <ProjectorControls backHref={`/classes/${code}`} />
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-[6vmin]">
        <div
          className="w-[min(70vw,58vh)] md:w-[min(42vw,70vh)] aspect-square rounded-2xl overflow-hidden bg-white [&_svg]:w-full [&_svg]:h-full"
          role="img"
          aria-label={`QR code for ${link}`}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="text-center md:text-left">
          <div className="t-section text-muted mb-2">
            {classLabel(cls)}{session?.name ? ` · ${session.name}` : ""}
          </div>
          <div className="font-display font-black text-accent leading-none tracking-[0.08em] text-[clamp(72px,14vmin,220px)]">
            {code}
          </div>
          <div className="text-[clamp(18px,2.6vmin,30px)] leading-[1.4] mt-4">
            Scan the code, or go to <span className="text-accent2 font-semibold">{host}</span>
            <br />and enter <span className="font-semibold">{code}</span>.
          </div>
          <div className="text-muted text-[clamp(14px,1.8vmin,20px)] mt-3">Sign in with your Mitty account first.</div>
        </div>
      </div>
    </div>
  );
}
