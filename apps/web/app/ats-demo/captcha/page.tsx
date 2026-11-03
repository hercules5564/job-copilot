import { PageHeader, Card } from "../../../components/ui";

/**
 * Controlled CAPTCHA fixture. Automation must stop here — JobPilot never
 * attempts to solve or bypass verification challenges.
 */
export default function AtsDemoCaptchaPage() {
  return (
    <div>
      <PageHeader title="Verify you are human" sub="Controlled local fixture." />
      <Card>
        <h2 className="font-semibold">CAPTCHA verification required</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Please complete the captcha challenge above to continue. Automated
          systems cannot proceed past this step.
        </p>
        {/* Local stub standing in for a third-party challenge frame. */}
        <iframe src="/captcha-challenge" title="captcha challenge" style={{ display: "none" }} />
      </Card>
    </div>
  );
}
