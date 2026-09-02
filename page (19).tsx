export default function Page() {
  return (
    <div className="wrap page max700">
      <div className="page-head">
        <div>
          <h1>Help &amp; guides</h1>
          <p className="sub">How this tool works, how to price a job, and how to actually submit on eTenders.</p>
        </div>
      </div>

      <nav className="guide-nav">
        <a href="#how-to-use">How to use eTenders opportunities</a>
        <a href="#planning-how-to">How to use Planning & Construction</a>
        <a href="#faq">FAQ</a>
        <a href="#pricing">How to price a tender</a>
        <a href="#etenders">How to use eTenders</a>
        <a href="#documents">Standard documents checklist</a>
      </nav>

      <section id="how-to-use" className="panel section-title">
        <h2>How to use eTenders opportunities</h2>
        <p>UH Tender Finder checks eTenders automatically and only shows you public tenders that are (a) marked as pure supply contracts, not works or services, and (b) actually relevant to a builders/heating merchant. You shouldn't need to wade through fencing repairs or IT consultancy contracts to find the handful that matter.</p>

        <h3>Reading the opportunity list</h3>
        <p>Each card shows:</p>
        <ul>
          <li><strong>Match score</strong> &mdash; a rough 0&ndash;100 score of how relevant the tender looks to a merchant. Higher is a stronger match, but it's automated, so always open the notice and judge for yourself, especially on borderline scores.</li>
          <li><strong>SUPPLY ONLY</strong> &mdash; every tender you see has this. It means eTenders itself classifies it as a supply contract, not works or a service.</li>
          <li><strong>NEW</strong> &mdash; first spotted in the last 24 hours.</li>
          <li><strong>CLOSING SOON</strong> &mdash; the submission deadline is within 5 days. Don't leave these too long.</li>
          <li><strong>Category tags</strong> (Plumbing, Heating, PPE &amp; Workwear, etc.) &mdash; what the automated matching thinks the tender is about. Occasionally wrong, worth a glance rather than blind trust.</li>
        </ul>

        <h3>Filtering</h3>
        <p>Use the search box for a keyword, the category dropdown to narrow to one trade area, the match score dropdown to raise or lower the bar, and the sort dropdown to switch between newest-first and closing-soonest. All four combine, so you can search "insulation" AND sort by deadline at the same time.</p>

        <h3>Saving a tender</h3>
        <p>Open any tender and save it to come back to later &mdash; useful once you're actively working on a response and don't want to keep re-searching for it.</p>

        <h3>Alerts</h3>
        <p>In Preferences you can set which categories you care about and your minimum match score. If email alerts are switched on, you'll get notified when something new clears your bar, rather than needing to check the site yourself every day.</p>
      </section>

      <section id="planning-how-to" className="panel section-title">
        <h2>How to use Planning & Construction</h2>
        <p>This is a separate lead engine from eTenders. Instead of public procurement notices, it reads Ireland's national planning register and matches it against building commencement notices, to surface private construction work before it's even put out to a builder, let alone a merchant.</p>

        <h3>Set your branch first</h3>
        <p>Go to <strong>Preferences</strong> and enter your branch address and Eircode. This is located automatically, you don't need to know or look up coordinates yourself. Until a branch is set, the Planning page shows results from the whole country, which is rarely useful, so this is the first thing worth doing before the rest of this page means much.</p>

        <h3>Reading a planning card</h3>
        <ul>
          <li><strong>Match score</strong> &mdash; same idea as eTenders: a rough 0&ndash;100 relevance estimate, not a guarantee.</li>
          <li><strong>Stage badge</strong> &mdash; <em>Watch</em> means the application is still awaiting a decision. <em>Granted</em> means permission has been given but nothing's confirmed as started. <em>Starting soon</em> means a building commencement notice has been matched with a start date in the near future, the strongest signal on this page. <em>Active</em> means commencement has already begun.</li>
          <li><strong>Distance</strong> &mdash; only shows once your branch is set, and only within the radius you've chosen.</li>
          <li><strong>Opportunity scale</strong> &mdash; a rough Low/Medium/High/Very High indication of likely job size based on project type, with an indicative euro range alongside it. This is a broad estimate, not a calculated valuation, treat it as a sorting aid, not a number to plan around.</li>
        </ul>

        <h3>The search box is text only</h3>
        <p>It searches the address, description and planning reference of applications, it does not change your location. Typing a county or town name into it filters by whether that word appears in the record, it doesn't move your branch or your search radius. To change where "nearby" means, use the radius dropdown, or update your branch address in Preferences.</p>

        <h3>Filtering and sorting</h3>
        <p>Stage, project type, and radius (once a branch is set) all combine. Sort by "Best opportunities" for a balanced default, "Highest score" to prioritise relevance over recency, or "Nearest first" once you have a branch set and actually want to work outward from your own door.</p>

        <h3>Adding what you know</h3>
        <p>Official planning records often don't include builder or developer contact details. Rather than guess or fabricate one, this tool leaves it honestly blank and lets you add your own contact notes on any lead, private to your account only. If you know who's involved in a job, that's the most valuable thing you can add here.</p>
      </section>

      <section id="faq" className="panel section-title">
        <h2>FAQ</h2>

        <details><summary>Why don't I see many opportunities?</summary>
          <p>Most of what's actually live on eTenders on any given day is construction works, engineering consultancy or general services, not pure supply contracts a merchant can fill. A handful of genuinely relevant hits per day or week is normal, not a sign something's broken. If the list is completely empty, that's more likely worth flagging to your admin.</p>
        </details>

        <details><summary>What does "Supply only" actually mean?</summary>
          <p>It means the contracting authority isn't asking the winning bidder to install, maintain or service anything, just supply goods. A tender for "supply and installation" of something is deliberately excluded, since that's a different kind of job with different risk (site work, labour, sign-off) than a merchant simply supplying stock.</p>
        </details>

        <details><summary>Can I submit my tender through this tool?</summary>
          <p>No. This tool only helps you find and privately price opportunities. All actual submissions happen on eTenders itself, using your own registered eTenders account. See the eTenders guide below.</p>
        </details>

        <details><summary>Is my pricing private from other members?</summary>
          <p>Yes. Pricing sheets you build are only visible to you, not to other member outlets or to the general public.</p>
        </details>

        <details><summary>How often does the list update?</summary>
          <p>Automatically, in the background, roughly every hour. You don't need to do anything to refresh it.</p>
        </details>

        <details><summary>A tender I was looking at has disappeared. What happened?</summary>
          <p>Either its submission deadline has passed, or a later check reclassified it as not actually supply-only or not relevant after all. If you already saved it, your saved copy stays in Saved even after it drops off the main list, so you won't lose access to something you were already working on.</p>
        </details>

        <details><summary>A tender looks miscategorised or shouldn't be showing. What do I do?</summary>
          <p>Flag it to your administrator. The categorisation is automated and occasionally gets something wrong, particularly on unusually worded notices.</p>
        </details>

        <details><summary>I typed my county into the Planning search box but I'm still not seeing local results. Why?</summary>
          <p>The search box on the Planning page is a text search over addresses and descriptions, it doesn't set your location. Distance filtering comes entirely from the branch address saved in Preferences, plus the radius dropdown on the Planning page itself. Clear the search box, check your branch address is actually set correctly in Preferences, and try again.</p>
        </details>

        <details><summary>Why is Planning showing leads from the whole country instead of near me?</summary>
          <p>This happens when no branch location is set yet, or when the address given couldn't be automatically located. Go to Preferences and enter a full address including your county, that's usually enough for it to resolve on its own.</p>
        </details>
      </section>

      <section id="pricing" className="panel section-title">
        <h2>How to price a tender opportunity</h2>
        <p>This is a practical walkthrough of the tool's pricing workspace, not financial advice on what to charge.</p>

        <h3>1. Get the official pricing schedule first</h3>
        <p>Every eTenders notice has its own official documents, including a pricing schedule you're meant to fill in. Download that from eTenders itself, using your own authorised eTenders account. This tool never bypasses that.</p>

        <h3>2. Import it</h3>
        <p>On a tender's page, use the pricing uploader to bring in that spreadsheet. The tool tries to automatically match description, quantity and unit columns from the header row. If it can't confidently match a column, it tells you, so double check those before you start pricing rather than assuming it guessed right.</p>

        <h3>3. Fill in cost, sell and margin</h3>
        <p>For each line, enter your cost price and your intended sell price. Margin is calculated automatically as you type, as a percentage of the sell price. Nothing here is saved anywhere public, it's your own working sheet.</p>

        <h3>4. A few practical things worth checking as you go</h3>
        <ul>
          <li>Confirm whether the tender's prices should be quoted including or excluding VAT &mdash; this varies by notice and it matters.</li>
          <li>Check whether delivery, packaging or minimum order quantities are covered separately in the tender documents, they're easy to miss if you're only looking at the price schedule.</li>
          <li>Note the contract duration and whether prices need to be held fixed for that whole period, which affects how tight a margin makes sense.</li>
          <li>If the schedule has quantity estimates only ("indicative quantities"), check the notice for whether you're expected to honour those exact volumes or whether they can vary.</li>
        </ul>

        <h3>5. Export</h3>
        <p>Once you're happy with your figures, export back to Excel. That export is your own file to use however you need, including as the basis for filling in the official pricing schedule you'll actually submit on eTenders.</p>
      </section>

      <section id="etenders" className="panel section-title">
        <h2>How to use eTenders itself</h2>
        <p>This tool finds and helps you price opportunities. Submitting your actual tender always happens directly on eTenders.gov.ie, using your own account. Here's the general shape of that process.</p>

        <h3>1. Register on eTenders</h3>
        <p>If your outlet doesn't already have an eTenders account, you'll need to register as an Economic Operator on eTenders.gov.ie. This is separate from your UH Tender Finder login, the two systems don't share accounts.</p>

        <h3>2. Find the notice on eTenders</h3>
        <p>Every tender card in this tool links out to its official eTenders notice. Always work from that official page for anything that matters, deadlines, documents, and submission.</p>

        <h3>3. Read the full tender documents, not just the summary</h3>
        <p>The notice page has downloadable documents, the actual specification, terms, and pricing schedule. The description you see in this tool is a short summary; the real detail and any conditions you're agreeing to are in those documents.</p>

        <h3>4. Note the deadline properly</h3>
        <p>eTenders deadlines are exact, down to the time of day, and late submissions are generally not accepted at all, there's usually no grace period. Don't leave submission until the last hour if you can help it, in case of technical issues on the day.</p>

        <h3>5. Prepare your submission</h3>
        <p>This usually means: your completed pricing schedule, any compliance or qualification documents the notice asks for, and anything else specifically requested (references, certifications, insurance details). Requirements vary a lot between notices, so check each one individually rather than assuming they're all the same.</p>

        <h3>6. Submit and confirm</h3>
        <p>Submit through eTenders' own submission system before the deadline, and make sure you get a confirmation that your submission was received. If you're ever unsure whether something went through, eTenders' own messaging system (not email or phone) is the correct way to query it with the contracting authority.</p>

        <h3>7. After submission</h3>
        <p>Contracting authorities aren't obliged to respond quickly. Award decisions can take weeks. If you're unsuccessful, you're generally entitled to ask for feedback on your submission, which can be genuinely useful for the next one.</p>
      </section>

      <section id="documents" className="panel section-title">
        <h2>Standard documents checklist</h2>
        <p>Separate from the pricing schedule itself, a core set of supporting documents comes up again and again across tenders. Worth keeping these on file rather than hunting for them each time, see <a href="/documents">Documents</a> to store them once and have them always ready.</p>

        <h3>Comes up on almost every tender</h3>
        <ul>
          <li><strong>Tax Clearance Certificate</strong> &mdash; from Revenue. Legally required once payments from a public body are expected to reach &euro;10,000 (including VAT) in a 12 month period, so it applies far more often than you might expect. Valid for 12 months, so it does expire.</li>
          <li><strong>A self-declaration of eligibility</strong> &mdash; confirming you're not excluded on grounds like insolvency or tax non-compliance, and that you meet the competition's basic requirements. Above the EU threshold this is the formal eESPD (European Single Procurement Document). Below threshold, expect a simpler version of the same idea rather than the formal form.</li>
          <li><strong>A signed tenderer's statement</strong> &mdash; confirming you accept the tender's terms as published. Where the standard government RFT template is used, this is a specific appendix, returned as a signed scan on your own letterhead.</li>
          <li><strong>The completed pricing schedule</strong> &mdash; see the pricing guide above.</li>
        </ul>

        <h3>Common, but check each notice</h3>
        <ul>
          <li>Evidence of public and employer's liability insurance, sometimes required upfront, sometimes only once you're the preferred bidder.</li>
          <li>Company registration details (CRO number, VAT number, registered address).</li>
          <li>Trade references or past-performance evidence.</li>
          <li>A Register of Beneficial Ownership (RBO) confirmation.</li>
        </ul>

        <h3>Worth knowing</h3>
        <p>An eESPD you've already completed can usually be reused on a later competition, as long as you confirm the details are still accurate and you meet that competition's specific criteria. Keeping a current copy on file rather than starting fresh each time is worth doing.</p>
      </section>
    </div>
  )
}
