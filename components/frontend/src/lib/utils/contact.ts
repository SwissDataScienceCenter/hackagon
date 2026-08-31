/**
 * The address the public pages' "Contact us" reaches.
 *
 * Held once rather than written at each call site: the landing page, the CTA at
 * its foot and the about page all offer the same route to the same inbox, and
 * three copies of a string is three chances for the visible text and the `href`
 * to drift apart.
 *
 * The hackathon team directly, not the general web form AppFooter's "Contact"
 * points at — someone asking from these pages has a hackathon in mind.
 */
export const HACKATHON_CONTACT_EMAIL = "hackathon@datascience.ch"
export const HACKATHON_CONTACT_MAILTO = `mailto:${HACKATHON_CONTACT_EMAIL}`
