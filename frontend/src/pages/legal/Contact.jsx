import LegalLayout from './LegalLayout';
import { siteInfo } from '../../config/siteInfo';

export default function Contact() {
  return (
    <LegalLayout title="Contact us" updated={false}>
      <p>Questions about your account, your care team or how we handle your data? Reach us using the details below.</p>

      <dl className="legal-contact">
        <div>
          <dt>Address</dt>
          <dd>
            {siteInfo.legalName}
            {siteInfo.addressLines.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd><a href={`mailto:${siteInfo.email}`}>{siteInfo.email}</a></dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd><a href={`tel:${siteInfo.phone.replace(/\s/g, '')}`}>{siteInfo.phone}</a></dd>
        </div>
        <div>
          <dt>Support hours</dt>
          <dd>{siteInfo.hours}</dd>
        </div>
        <div>
          <dt>Grievance Officer</dt>
          <dd>
            {siteInfo.grievanceName}
            <span className="block"><a href={`mailto:${siteInfo.grievanceEmail}`}>{siteInfo.grievanceEmail}</a></span>
          </dd>
        </div>
      </dl>

      <p className="legal-note">
        In a medical emergency, call 112 (India) or go to your nearest hospital. CasterlyCare is not an emergency service.
      </p>
    </LegalLayout>
  );
}
