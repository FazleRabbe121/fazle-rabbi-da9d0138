import { ProviderUnavailableError, ValidationError } from "../core/errors.mjs";

export async function createFollowUpDraft({ model, application, verifiedContact, daysSinceApplication = 10 }) {
  if (!model?.generateJSON) throw new ProviderUnavailableError("Follow-up drafting requires the self-hosted model.");
  if (!application?.id || !application?.employer || !application?.role) throw new ValidationError("An existing application record is required.");
  if (!verifiedContact?.email || verifiedContact.status !== "verified" || !verifiedContact.sourceUrl) {
    throw new ValidationError("A verified employer contact with a source URL is required before preparing a follow-up.");
  }
  if (application.status === "bounced" || application.status === "rejected" || application.status === "interview") {
    throw new ValidationError("A routine status follow-up is not appropriate for this application state.");
  }
  if (daysSinceApplication < 5) throw new ValidationError("Wait at least five days after the recorded application date before preparing a routine follow-up.");
  if (application.lastFollowUpAt) throw new ValidationError("A previous follow-up is already recorded. Review its outcome before another message.");

  const result = await model.generateJSON({
    system: "Write a concise, polite follow-up email about an existing job application. Use only supplied facts. Never claim the employer replied, received the application, or confirmed sponsorship unless the supplied application record says so. Return JSON {subject, body, missingFacts}.",
    user: { application, verifiedContact },
    temperature: 0.2,
  });
  const subject = String(result?.subject || "").trim();
  const body = String(result?.body || "").trim();
  if (!subject || !body) throw new ValidationError("The model did not return a complete follow-up draft.");
  return { subject, body, missingFacts: Array.isArray(result.missingFacts) ? result.missingFacts.map(String) : [], applicationId: application.id, recipient: verifiedContact.email, recipientSourceUrl: verifiedContact.sourceUrl, sendStatus: "not_sent" };
}
