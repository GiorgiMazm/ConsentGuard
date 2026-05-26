/**
 * Public privacy policy page for ConsentGuard.
 * This route is NOT behind Shopify auth — it must be publicly accessible
 * for App Store listing requirements.
 */
export default function PrivacyPolicy() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ConsentGuard - Privacy Policy</title>
        <style>{`
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
          h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
          h2 { font-size: 1.3rem; margin-top: 2rem; }
          p, li { font-size: 0.95rem; }
          .updated { color: #666; font-size: 0.85rem; margin-bottom: 2rem; }
        `}</style>
      </head>
      <body>
        <h1>ConsentGuard Privacy Policy</h1>
        <p className="updated">Last updated: May 2026</p>

        <h2>What data we collect</h2>
        <p>
          ConsentGuard collects and stores the following data when installed on a
          Shopify store:
        </p>
        <ul>
          <li>
            <strong>Store information:</strong> Your myshopify.com domain and
            plan preferences (which ConsentGuard tier you subscribe to).
          </li>
          <li>
            <strong>Consent block configuration:</strong> The consent blocks,
            display rules, and translations you create in the app.
          </li>
          <li>
            <strong>Consent audit records:</strong> When a customer completes
            checkout, we record which consent blocks were displayed, whether they
            were accepted, the order number, the locale, and a snapshot of the
            consent text. We do <strong>not</strong> store any personally
            identifiable customer information (no names, emails, or addresses).
          </li>
        </ul>

        <h2>How we use your data</h2>
        <p>
          Data is used solely to provide the ConsentGuard service: displaying
          consent blocks during checkout and maintaining an audit log of consent
          events for your compliance records.
        </p>

        <h2>Data retention</h2>
        <p>
          Audit log records are retained according to your plan: 30 days (Free),
          90 days (Pro), or 365 days (Business). You can configure a shorter
          retention period in the app settings.
        </p>

        <h2>Data sharing</h2>
        <p>
          We do not sell, rent, or share your data with third parties. Data is
          stored on servers within the app's hosting infrastructure and is only
          accessible to you through the Shopify admin.
        </p>

        <h2>Data deletion</h2>
        <p>
          When you uninstall ConsentGuard, all your data (consent blocks,
          settings, and audit records) is automatically deleted. You can also
          request data deletion by contacting us.
        </p>

        <h2>GDPR compliance</h2>
        <p>
          ConsentGuard handles all mandatory Shopify GDPR webhooks: customer data
          requests, customer data erasure, and shop data erasure. When Shopify
          sends a data deletion request, the relevant records are removed from
          our database.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions or data requests, contact us at:{" "}
          <strong>privacy@consentguard.app</strong>
        </p>
      </body>
    </html>
  );
}
