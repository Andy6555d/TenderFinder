export const metadata = { title: 'Terms of Service — UH Tender Finder' }

export default function Page() {
  return (
    <div className="wrap page max700 legal-page">
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: <span className="placeholder">[DATE]</span></p>

      <p>These terms govern your use of UH Tender Finder ("the Service"). By creating an account, you agree to them.</p>

      <h2>1. What the Service is</h2>
      <p>The Service surfaces public tender notices from eTenders.gov.ie, national planning applications, and Building Control Management System commencement notices, and provides tools to filter, score, save, and privately price them. It does not submit anything on your behalf, and it is not affiliated with, endorsed by, or an official publication of eTenders, the Office of Government Procurement, the Department of Housing, or any local authority.</p>

      <h2>2. Automated classification is an aid, not a guarantee</h2>
      <p>Relevance scores, category tags, "Supply Only" classification, and opportunity value estimates are generated automatically from the underlying public record and are provided as a starting point, not a determination you should rely on without checking the source. In particular:</p>
      <ul>
        <li>Estimated opportunity values shown on planning leads are rough indicative ranges based on project type and scale, not calculated valuations, and should not be relied on for any financial or business decision.</li>
        <li>"Supply Only" and relevance classifications are automated and can occasionally be wrong, particularly on unusually worded notices. Always verify the official notice before deciding whether to bid or respond.</li>
        <li>Commencement-notice matches are based on normalized reference matching between two independently maintained public datasets and may occasionally be incomplete or mismatched.</li>
      </ul>
      <p>You are responsible for verifying all details directly against the official source (eTenders.gov.ie, the relevant local authority, or the National Building Control and Market Surveillance Office) before submitting a tender, quoting a price, or making any business decision based on information shown in the Service.</p>

      <h2>3. Accuracy of underlying public data</h2>
      <p>The Service does not control, verify, or guarantee the accuracy, completeness, or currency of the public records it displays. Errors, delays, or omissions in the source data (including local authority planning registers and the national commencement notice register) are outside our control.</p>

      <h2>4. Your account</h2>
      <p>You're responsible for keeping your login credentials secure and for the accuracy of the information you provide, including your outlet details and branch address. Accounts are for use by genuine member outlets; we reserve the right to suspend accounts used in breach of these terms.</p>

      <h2>5. Your content</h2>
      <p>Pricing sheets, uploaded documents, and contact notes you create remain yours. They're private to your account by design, we don't access or use them other than to provide the Service to you, and we don't share them with other members or third parties.</p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to scrape, bulk-export, or resell data from the Service, attempt to bypass its access controls, or use it in any way that could disrupt or overload the underlying public data sources it depends on.</p>

      <h2>7. No warranty</h2>
      <p>The Service is provided "as is." We make no warranty that it will be uninterrupted, error-free, or that the underlying public data feeds will always be available, current, or accurate.</p>

      <h2>8. Limitation of liability</h2>
      <p>To the fullest extent permitted by law, we are not liable for any loss arising from a missed opportunity, an inaccurate classification, incomplete data, or reliance on information shown in the Service. Business and procurement decisions remain your responsibility, made against the official source records.</p>

      <h2>9. Changes to the Service or these terms</h2>
      <p>We may update these terms or change, suspend, or discontinue any part of the Service at any time. Material changes to these terms will be reflected by an updated date at the top of this page.</p>

      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of Ireland.</p>

      <h2>11. Contact</h2>
      <p><span className="placeholder">[CONTACT EMAIL / ADDRESS]</span></p>
    </div>
  )
}
