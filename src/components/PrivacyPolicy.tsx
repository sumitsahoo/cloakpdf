/**
 * Privacy Policy page.
 *
 * Describes how CloakPDF handles (or rather, does not handle) user data.
 * All processing is client-side, so the policy is intentionally brief.
 */

import { ShieldCheck } from "lucide-react";

export function PrivacyPolicy() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center shrink-0">
          <ShieldCheck className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-dark-text">Privacy Policy</h1>
          <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">
            Last updated: April 3, 2026
          </p>
        </div>
      </div>

      <div className="space-y-8 text-sm text-slate-600 dark:text-dark-text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            Overview
          </h2>
          <p>
            CloakPDF is a free, open-source PDF toolkit that runs entirely in your web browser. We
            are committed to your privacy. This policy explains what data we collect (spoiler: none)
            and how the application works.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            Your Files Stay on Your Device
          </h2>
          <p>
            All PDF processing — merging, splitting, compressing, signing, OCR, and every other
            operation — is performed locally in your browser using JavaScript. Your files are{" "}
            <strong className="text-slate-700 dark:text-dark-text">never uploaded</strong> to any
            server. No file content, metadata, or document data is transmitted over the network.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            No Personal Data Collected
          </h2>
          <p>We do not collect, store, or process any personal information, including:</p>
          <ul className="mt-2 space-y-1 list-disc list-inside marker:text-slate-400">
            <li>Names, email addresses, or account details (there are no accounts)</li>
            <li>IP addresses or device identifiers</li>
            <li>Usage analytics or behavioural tracking</li>
            <li>Cookies or persistent identifiers of any kind</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            No Cookies or Tracking
          </h2>
          <p>
            CloakPDF does not use cookies, local storage for tracking purposes, or any third-party
            analytics or advertising scripts. The application may use your browser&apos;s cache and
            a Service Worker to enable offline use after the first visit; this data is stored only
            on your device and is never sent anywhere.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            Third-Party Services
          </h2>
          <p>
            CloakPDF does not integrate any third-party analytics, advertising, or data-collection
            services. The application is hosted as a static site; standard web-server access logs
            (IP address, requested path, timestamp) may be retained by the hosting provider for
            security and operational purposes, subject to the hosting provider&apos;s own privacy
            policy. No file content is included in these logs.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            Open Source
          </h2>
          <p>
            CloakPDF is open source. You can inspect the full source code at{" "}
            <a
              href="https://github.com/sumitsahoo/cloakpdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              github.com/sumitsahoo/cloakpdf
            </a>{" "}
            to verify these claims independently.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            Your Rights (GDPR &amp; Similar)
          </h2>
          <p>
            Because we do not collect any personal data, there is nothing for us to disclose,
            correct, or delete on your behalf. If you have questions about this policy, you can
            reach out via{" "}
            <a
              href="https://github.com/sumitsahoo/cloakpdf/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              GitHub Issues
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
            Changes to This Policy
          </h2>
          <p>
            If this policy ever changes, the updated version will be published here with a revised
            date at the top. Given the privacy-by-design nature of this application, significant
            changes are unlikely.
          </p>
        </section>
      </div>
    </div>
  );
}
