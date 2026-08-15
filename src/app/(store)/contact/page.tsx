/**
 * Renders the contact page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";

export default function ContactPage() {
  return (
    <ContentPageTemplate area="Contact" body="Contact either Upper East Side store for product availability while the ecommerce catalog is connected." sectionId="contact.index" title="Contact Modern State">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface-card p-5">
          <p className="font-semibold">3rd Avenue</p>
          <p className="text-secondary">212-879-8076</p>
        </div>
        <div className="surface-card p-5">
          <p className="font-semibold">86th Street</p>
          <p className="text-secondary">212-831-8010</p>
        </div>
      </div>
      <section className="mt-8 surface-card p-5" id="newsletter">
        <h2 className="font-display text-2xl font-semibold">Newsletter</h2>
        <p className="mt-2 text-secondary">Email signup will collect email, first name, and last name with consent tracking.</p>
      </section>
    </ContentPageTemplate>
  );
}
