import LegalLayout from './LegalLayout';
import { siteInfo } from '../../config/siteInfo';

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updatedLabel="Last Updated:">
      <p>
        This policy explains how {siteInfo.legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), operating as {siteInfo.brand}, collects, processes, and protects your personal data.
        We engineer our platform with privacy at its core, handling all information in strict compliance with India&rsquo;s Digital Personal Data Protection (DPDP) Act, 2023, and the Information Technology Act, 2000.
      </p>

      <h2>1. Data Fiduciary &amp; Responsibility</h2>
      <p>
        {siteInfo.legalName}, located in Hyderabad, Telangana, India, 500090, acts as the Data Fiduciary for the information you entrust to {siteInfo.brand}.
      </p>
      <p><strong>Contact:</strong> <a href={`mailto:${siteInfo.email}`}>{siteInfo.email}</a></p>

      <h2>2. Information We Collect</h2>
      <p>To provide a secure and seamless healthcare experience, we collect the following data:</p>
      <ul>
        <li><strong>Account Credentials:</strong> Name, email address, mobile number, postal address, blood group, and account passwords (which are strictly stored as irreversible one-way hashes).</li>
        <li><strong>Clinical &amp; Recovery Data:</strong> Surgical history, post-operative recovery metrics, daily vitals (SpO₂, BP, heart rate, temperature), medication schedules, dietary restrictions, diagnostic lab reports, and clinical notes entered by your assigned doctor.</li>
        <li><strong>Communications &amp; Alerts:</strong> Chat logs with your medical team, interactions with the Kingslayer AI assistant, and triggered SOS emergency escalations.</li>
        <li><strong>Technical &amp; Diagnostic Data:</strong> Secure JWT sign-in sessions, device identifiers, and server request logs (including IP addresses) strictly utilized for security monitoring and troubleshooting.</li>
      </ul>

      <h2>3. How We Use Your Data</h2>
      <p>Your data is never monetized. We utilize it solely to deliver and improve your care:</p>
      <ul>
        <li><strong>Platform Operations:</strong> To authenticate your account and securely route you to the correct role-based dashboard (Patient, Doctor, or Administrator).</li>
        <li><strong>Care Coordination:</strong> To manage appointment scheduling, track your recovery trajectory, and instantly escalate SOS alerts to on-duty doctors or administrators.</li>
        <li><strong>Service Notifications:</strong> To dispatch medication reminders, schedule updates, and essential one-time passwords (OTPs).</li>
        <li><strong>Security &amp; Compliance:</strong> To maintain system integrity, prevent unauthorized access, and fulfill our legal regulatory obligations.</li>
      </ul>
      <p>We process this data based on your explicit consent granted at account creation, and as permitted by law for the provision of medical care and health record maintenance.</p>

      <h2>4. Data Access &amp; Sub-Processors</h2>
      <p>Access to your personal data is strictly compartmentalized:</p>
      <ul>
        <li><strong>Your Care Team:</strong> Your uniquely assigned doctor accesses your clinical data to manage your recovery. Hospital administrators see appointment schedules (patient and doctor names and contact details, the type of visit, and the surgery) and, for SOS alerts, the patient&rsquo;s name, surgery, and blood group, so they can manage facility schedules and emergency dispatches. Administrators cannot open your medical files, vitals, medicines, diet, notes, or chats.</li>
        <li><strong>Infrastructure Partners:</strong> We employ vetted third-party services to run {siteInfo.brand}, including SMS delivery providers (e.g., 2Factor) for OTPs, secure cloud hosting/database providers, and our LLM provider (for processing Kingslayer AI queries and diet-safety checks).</li>
        <li><strong>Legal Authorities:</strong> We will only disclose information to law enforcement or regulatory bodies when legally compelled to do so.</li>
      </ul>
      <p>We do not sell your personal data or utilize it for targeted advertising. Some of our infrastructure partners may process data on secure servers located outside of India.</p>

      <h2>5. Cookies &amp; Local Storage</h2>
      <p>{siteInfo.brand} employs a strict &ldquo;essential-only&rdquo; storage model. We use local browser storage and minimal cookies exclusively to:</p>
      <ul>
        <li>Maintain your secure JWT authentication session.</li>
        <li>Remember your role interface (Admin/Doctor/Patient) to prevent UI flashing.</li>
        <li>Save non-identifying UI preferences (e.g., a collapsed sidebar and cookie notice dismissal).</li>
      </ul>
      <p>We deploy zero advertising, tracking, or third-party analytics cookies.</p>

      <h2>6. Data Retention</h2>
      <p>
        We retain your personal and medical data only for as long as your account remains active, or as required to fulfill medical record-keeping and legal obligations.
        You maintain the right to request full account deletion at any time. Upon request, we will purge your data unless a specific legal statute mandates its retention.
      </p>

      <h2>7. Security Architecture</h2>
      <p>
        Your privacy is enforced through our technical architecture. Passwords are cryptographically hashed, backend endpoints are secured by strict role-based JWT guards, medical files can be opened only by the patient they belong to and that patient&rsquo;s treating doctor, and patients re-enter their password before viewing their lab reports.
        While no digital system is impenetrable, we secure data in transit via encrypted connections. In the highly unlikely event of a data breach, we will notify you and the Data Protection Board of India as required by law.
      </p>

      <h2>8. Your Privacy Rights</h2>
      <p>Under the DPDP Act, you possess the right to:</p>
      <ul>
        <li><strong>Access:</strong> Request a comprehensive summary of the personal data we hold and how it is being processed.</li>
        <li><strong>Correction &amp; Erasure:</strong> Update inaccurate details, complete missing information, or request the deletion of your records.</li>
        <li><strong>Consent Withdrawal:</strong> Revoke your consent for data processing at any time (note that this will limit our ability to provide you with {siteInfo.brand} services).</li>
        <li><strong>Nomination:</strong> Designate a trusted individual to exercise your data rights in the event you become incapacitated.</li>
        <li><strong>Grievance Redressal:</strong> Lodge a formal complaint regarding your data handling.</li>
      </ul>

      <h2>9. Minors</h2>
      <p>{siteInfo.brand} is engineered for adult patients. If a patient is under 18 years of age, a parent or legally recognized guardian must create the account, manage the profile, and provide explicit verifiable consent on the minor&rsquo;s behalf.</p>

      <h2>10. Policy Updates</h2>
      <p>
        As {siteInfo.brand} evolves, we may update this policy. If material changes are made to how we handle your data, we will revise the &ldquo;Last Updated&rdquo; date above and push a prominent notification directly to your dashboard.
      </p>

      <h2>11. Contact &amp; Grievance Officer</h2>
      <p>
        If you have concerns about your privacy or wish to exercise your rights, please contact our Grievance Officer first.
        If your concern is not resolved satisfactorily, you hold the right to approach the Data Protection Board of India.
      </p>
      <p>
        <strong>Grievance Officer:</strong> {siteInfo.grievanceName}
        <br /><strong>Email:</strong> <a href={`mailto:${siteInfo.grievanceEmail}`}>{siteInfo.grievanceEmail}</a>
        <br /><strong>Address:</strong> Hyderabad, Telangana, India, 500090
      </p>
    </LegalLayout>
  );
}
