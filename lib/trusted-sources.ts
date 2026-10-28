// The sites research may search and pinned findings may link to (docs/03).
// allowed_domains covers subdomains, so nih.gov includes PubMed. ASCII only:
// the web-search docs warn that look-alike Unicode domains can slip a filter.

export const RESEARCH_DOMAINS = [
  "nsca.com",            // National Strength and Conditioning Association
  "acsm.org",            // American College of Sports Medicine
  "nih.gov",             // NIH, including PubMed and PMC
  "cdc.gov",             // Centers for Disease Control and Prevention
  "nata.org",            // National Athletic Trainers' Association
  "aap.org",             // American Academy of Pediatrics
  "healthychildren.org", // AAP's site for families
] as const;

/** An https URL whose host is a trusted domain or one of its subdomains. */
export function isTrustedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return RESEARCH_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
