import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { siteInfo } from '../../config/siteInfo';

export default function Terms() {
  return (
    <LegalLayout title="Terms and Conditions" updatedLabel="Last updated:">
      <p>
        These terms govern your use of {siteInfo.brand}, operated by {siteInfo.legalName}. By creating an account or using the service, you agree to these terms and to our <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. What the service is</h2>
      <p>
        {siteInfo.brand} helps patients and their care team track recovery after surgery: appointments, medicines, diet, lab reports, check-ins, and messages.
        It supports your care; it does not replace your doctor.
      </p>

      <h2>2. Not medical advice, not an emergency service</h2>
      <p>Information in the app, including replies from the Kingslayer in-app AI assistant, is general guidance and can be wrong. Always follow your doctor&rsquo;s instructions.</p>
      <p>The SOS feature alerts your care team or hospital administrators. It is not guaranteed to be answered immediately. In an emergency, call 112 (India) or go to the nearest hospital.</p>

      <h2>3. Your account</h2>
      <p>Patients register with the unique ID given by their assigned doctor. Doctor and administrator accounts are created by the hospital administration.</p>
      <p>Give accurate information and keep it up to date. Keep your password and one-time codes private. You are responsible for activity on your account; tell us straight away if you suspect misuse.</p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use another person&rsquo;s account, or share access to yours.</li>
        <li>Upload unlawful, harmful, or misleading content, or files that contain malware.</li>
        <li>Try to break, overload, or bypass the security of the service.</li>
        <li>Misuse the SOS feature, for example, by sending false alerts.</li>
      </ul>

      <h2>5. Your information</h2>
      <p>You keep your rights in the information you provide. You allow us and your care team to use it to provide the service, as described in the Privacy Policy. Doctors are responsible for the medical notes and instructions they record.</p>

      <h2>6. Availability</h2>
      <p>We work to keep the service running but do not promise it will always be uninterrupted or error-free. We may change or pause features for maintenance or safety.</p>

      <h2>7. Limits of liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential loss, or for decisions made using information in the app instead of professional medical advice.
        Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>8. Suspension and ending</h2>
      <p>You can stop using the service and ask us to delete your account at any time. We may suspend or close accounts that break these terms or put others at risk.</p>

      <h2>9. Governing law</h2>
      <p>These terms are governed by the laws of India. The courts at {siteInfo.jurisdictionCity}, have jurisdiction over disputes, subject to any rights you have under consumer law.</p>

      <h2>10. Changes and contact</h2>
      <p>
        We may update these terms; if a change matters we will update the date above and tell you in the app. For questions, you can reach out to our Grievance Officer, {siteInfo.grievanceName}, at{' '}
        <a href={`mailto:${siteInfo.grievanceEmail}`}>{siteInfo.grievanceEmail}</a>.
      </p>
    </LegalLayout>
  );
}
