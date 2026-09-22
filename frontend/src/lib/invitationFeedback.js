export function invitationFeedback(result) {
  if (result.simulated || result.delivery === 'simulated') return 'Simulated invitation — no email was sent';
  if (result.delivery === 'sent') return 'Invitation submitted for email delivery';
  return 'Invitation pending — email delivery is unavailable. An administrator can retry later.';
}
