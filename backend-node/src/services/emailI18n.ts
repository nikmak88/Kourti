/**
 * Email texts in English and Greek.
 *
 * The language of an email is the recipient's choice (profiles.preferred_language,
 * set with the EN/ΕΛ switch in the app) or, for people without a staff account
 * (invitees, client-portal users), the install default DEFAULT_LANGUAGE.
 * Values passed into these functions are already HTML-escaped where needed.
 */
import { env } from '../config/env.js';
import { db } from '../db/pool.js';

export type EmailLang = 'en' | 'el';

export async function languageForEmail(email: string): Promise<EmailLang> {
  try {
    const r = await db.query<{ preferred_language: string | null }>(
      `select p.preferred_language
         from public.auth_users au
         join public.profiles p on p.user_id = au.id
        where lower(au.email) = lower($1)
        limit 1`,
      [email]
    );
    const lang = r.rows[0]?.preferred_language;
    if (lang === 'en' || lang === 'el') return lang;
  } catch {
    /* fall back to the install default */
  }
  return env.DEFAULT_LANGUAGE;
}

const en = {
  hi: 'Hi,',
  hiName: (name: string) => `Hi ${name},`,
  footerRights: 'All rights reserved.',
  footerPreferences: 'Manage preferences',
  footerOpen: (brand: string) => `Open ${brand}`,
  directLink: 'Direct link:',
  ignoreIfNotRequested: "If you didn't request this, you can safely ignore this email.",
  codeExpires: 'This code expires in 10 minutes and can only be used once.',

  resetSubject: (name: string) => `Reset your ${name} password`,
  resetIntro: (name: string) => `We received a request to reset your password for your <strong>${name}</strong> account.`,
  resetButton: 'Reset password',
  resetExpires: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",

  otpSubject: {
    login: (brand: string) => `Your ${brand} sign-in code`,
    signup: (brand: string) => `Verify your email for ${brand}`,
    enable_2fa: (brand: string) => `Enable email 2FA for ${brand}`,
  },
  otpIntro: {
    login: 'Use the code below to finish signing in:',
    signup: 'Use the code below to verify your email address and finish creating your account:',
    enable_2fa: 'Use the code below to confirm enabling email two-factor authentication:',
  },

  welcomeSubject: (brand: string) => `Welcome to ${brand}!`,
  welcomeIntro: (brand: string) => `Welcome to <strong>${brand}</strong>! We're excited to have you on board.`,
  welcomeWhat: "Here's what you can do:",
  welcomeItems: [
    'Manage your matters and clients',
    'Use AI-powered contract analysis',
    'Collaborate with your team',
    'Track documents and deadlines',
  ],
  welcomeButton: 'Get started',

  inviteSubject: (org: string, brand: string) => `You've been invited to ${org} on ${brand}`,
  inviteTitle: (org: string) => `You've been invited to ${org}`,
  inviteBody: (inviter: string, org: string, role: string | undefined, brand: string) =>
    `<strong>${inviter}</strong> has invited you to join <strong>${org}</strong>${role ? ` as <strong>${role}</strong>` : ''} on ${brand}.`,
  inviteButton: 'Accept invitation',
  inviteNote: 'Click the button above to choose your password and sign in.',

  viewDetails: 'View details',

  clientOtpSubject: 'Your secure sign-in code',
  clientOtpIntro: 'Use the code below to finish signing in to your client portal:',

  portalInviteIntro: (inviter: string | null, firm: string) =>
    inviter ? `<strong>${inviter}</strong> at <strong>${firm}</strong> has invited you` : `<strong>${firm}</strong> has invited you`,
  portalInviteScopeMatter: (intro: string, matter: string) =>
    `${intro} to follow your matter <strong>&ldquo;${matter}&rdquo;</strong> on a secure client portal.`,
  portalInviteScopeAll: (intro: string) => `${intro} to a secure client portal where you can follow your matters.`,
  portalInviteSubjectMatter: (firm: string, matter: string) => `${firm} invited you to view "${matter}"`,
  portalInviteSubjectAll: (firm: string) => `${firm} invited you to your client portal`,
  portalInviteBenefits:
    'You can view real-time updates, important documents, and communicate directly with your legal team — all in one place.',
  portalInviteButton: 'Accept invitation &amp; set password',
  portalInviteExpires:
    "This invitation link expires in 24 hours. If you weren't expecting this email, you can safely ignore it.",

  accessIntro: (inviter: string | null, firm: string) =>
    inviter
      ? `<strong>${inviter}</strong> at <strong>${firm}</strong> has given you access to your matters on a secure client portal.`
      : `<strong>${firm}</strong> has given you access to your matters on a secure client portal.`,
  accessSubject: (firm: string) => `${firm} gave you access to your client portal`,
  accessExisting: 'You already have an account — just sign in with your existing email and password.',
  accessButton: 'Sign in to your portal',
  accessForgot:
    "If you've forgotten your password, use “Forgot password” on the sign-in page. If you weren't expecting this, you can ignore it.",

  clientResetSubject: 'Reset your client portal password',
  clientResetIntro: 'We received a request to reset the password for your client portal account.',

  updateMatter: 'Matter:',
  updateButton: 'View your matter',
  updateQuestions: 'Questions? Reply to this email or message your legal team directly through the portal.',

  portalNotifSubjectOne: (title: string) => `New update: ${title}`,
  portalNotifSubjectMany: (count: number) => `You have ${count} new updates on your matters`,
  portalNotifIntro: "Here's what's new across your matters:",
  portalNotifButton: 'Open your client portal',
  portalNotifWhy:
    "You're receiving this because you follow these matters on your client portal. You can turn these emails off from the notifications menu in the portal.",
};

type EmailTexts = typeof en;

const el: EmailTexts = {
  hi: 'Γεια σας,',
  hiName: (name: string) => `Γεια σας ${name},`,
  footerRights: 'Με την επιφύλαξη παντός δικαιώματος.',
  footerPreferences: 'Ρυθμίσεις ειδοποιήσεων',
  footerOpen: (brand: string) => `Άνοιγμα ${brand}`,
  directLink: 'Άμεσος σύνδεσμος:',
  ignoreIfNotRequested: 'Αν δεν το ζητήσατε εσείς, μπορείτε να αγνοήσετε αυτό το email.',
  codeExpires: 'Ο κωδικός λήγει σε 10 λεπτά και μπορεί να χρησιμοποιηθεί μόνο μία φορά.',

  resetSubject: (name: string) => `Επαναφορά κωδικού πρόσβασης ${name}`,
  resetIntro: (name: string) =>
    `Λάβαμε αίτημα επαναφοράς του κωδικού πρόσβασης για τον λογαριασμό σας στο <strong>${name}</strong>.`,
  resetButton: 'Επαναφορά κωδικού',
  resetExpires: 'Ο σύνδεσμος λήγει σε 1 ώρα. Αν δεν το ζητήσατε εσείς, μπορείτε να αγνοήσετε αυτό το email.',

  otpSubject: {
    login: (brand: string) => `Κωδικός σύνδεσης ${brand}`,
    signup: (brand: string) => `Επαλήθευση email για το ${brand}`,
    enable_2fa: (brand: string) => `Ενεργοποίηση ελέγχου δύο παραγόντων μέσω email στο ${brand}`,
  },
  otpIntro: {
    login: 'Χρησιμοποιήστε τον παρακάτω κωδικό για να ολοκληρώσετε τη σύνδεση:',
    signup: 'Χρησιμοποιήστε τον παρακάτω κωδικό για να επαληθεύσετε το email σας και να ολοκληρώσετε τη δημιουργία του λογαριασμού:',
    enable_2fa: 'Χρησιμοποιήστε τον παρακάτω κωδικό για να επιβεβαιώσετε την ενεργοποίηση του ελέγχου ταυτότητας δύο παραγόντων μέσω email:',
  },

  welcomeSubject: (brand: string) => `Καλώς ήρθατε στο ${brand}!`,
  welcomeIntro: (brand: string) => `Καλώς ήρθατε στο <strong>${brand}</strong>! Χαιρόμαστε που είστε μαζί μας.`,
  welcomeWhat: 'Τι μπορείτε να κάνετε:',
  welcomeItems: [
    'Να διαχειρίζεστε τις υποθέσεις και τους πελάτες σας',
    'Να αναλύετε συμβάσεις με τη βοήθεια AI',
    'Να συνεργάζεστε με την ομάδα σας',
    'Να παρακολουθείτε έγγραφα και προθεσμίες',
  ],
  welcomeButton: 'Ξεκινήστε',

  inviteSubject: (org: string, brand: string) => `Πρόσκληση στο ${org} (${brand})`,
  inviteTitle: (org: string) => `Πρόσκληση στο ${org}`,
  inviteBody: (inviter: string, org: string, role: string | undefined, brand: string) =>
    `Ο/Η <strong>${inviter}</strong> σας προσκαλεί στο <strong>${org}</strong>${role ? ` με ρόλο <strong>${role}</strong>` : ''} στο ${brand}.`,
  inviteButton: 'Αποδοχή πρόσκλησης',
  inviteNote: 'Πατήστε το παραπάνω κουμπί για να ορίσετε τον κωδικό σας και να συνδεθείτε.',

  viewDetails: 'Προβολή λεπτομερειών',

  clientOtpSubject: 'Ο κωδικός ασφαλούς σύνδεσής σας',
  clientOtpIntro: 'Χρησιμοποιήστε τον παρακάτω κωδικό για να ολοκληρώσετε τη σύνδεση στην πύλη πελατών:',

  portalInviteIntro: (inviter: string | null, firm: string) =>
    inviter
      ? `Ο/Η <strong>${inviter}</strong> από το <strong>${firm}</strong> σας προσκαλεί`
      : `Το <strong>${firm}</strong> σας προσκαλεί`,
  portalInviteScopeMatter: (intro: string, matter: string) =>
    `${intro} να παρακολουθείτε την υπόθεσή σας <strong>«${matter}»</strong> μέσα από μια ασφαλή πύλη πελατών.`,
  portalInviteScopeAll: (intro: string) =>
    `${intro} σε μια ασφαλή πύλη πελατών, όπου μπορείτε να παρακολουθείτε τις υποθέσεις σας.`,
  portalInviteSubjectMatter: (firm: string, matter: string) => `${firm}: πρόσκληση για την υπόθεση «${matter}»`,
  portalInviteSubjectAll: (firm: string) => `${firm}: πρόσκληση στην πύλη πελατών`,
  portalInviteBenefits:
    'Μπορείτε να βλέπετε ενημερώσεις σε πραγματικό χρόνο και σημαντικά έγγραφα, και να επικοινωνείτε απευθείας με τη νομική σας ομάδα — όλα σε ένα σημείο.',
  portalInviteButton: 'Αποδοχή πρόσκλησης &amp; ορισμός κωδικού',
  portalInviteExpires:
    'Ο σύνδεσμος της πρόσκλησης λήγει σε 24 ώρες. Αν δεν περιμένατε αυτό το email, μπορείτε να το αγνοήσετε.',

  accessIntro: (inviter: string | null, firm: string) =>
    inviter
      ? `Ο/Η <strong>${inviter}</strong> από το <strong>${firm}</strong> σας έδωσε πρόσβαση στις υποθέσεις σας μέσα από μια ασφαλή πύλη πελατών.`
      : `Το <strong>${firm}</strong> σας έδωσε πρόσβαση στις υποθέσεις σας μέσα από μια ασφαλή πύλη πελατών.`,
  accessSubject: (firm: string) => `${firm}: πρόσβαση στην πύλη πελατών`,
  accessExisting: 'Έχετε ήδη λογαριασμό — συνδεθείτε με το υπάρχον email και τον κωδικό σας.',
  accessButton: 'Σύνδεση στην πύλη',
  accessForgot:
    'Αν ξεχάσατε τον κωδικό σας, χρησιμοποιήστε την επιλογή «Ξέχασα τον κωδικό» στη σελίδα σύνδεσης. Αν δεν περιμένατε αυτό το email, μπορείτε να το αγνοήσετε.',

  clientResetSubject: 'Επαναφορά κωδικού πύλης πελατών',
  clientResetIntro: 'Λάβαμε αίτημα επαναφοράς του κωδικού για τον λογαριασμό σας στην πύλη πελατών.',

  updateMatter: 'Υπόθεση:',
  updateButton: 'Προβολή υπόθεσης',
  updateQuestions:
    'Έχετε ερωτήσεις; Απαντήστε σε αυτό το email ή στείλτε μήνυμα στη νομική σας ομάδα μέσα από την πύλη.',

  portalNotifSubjectOne: (title: string) => `Νέα ενημέρωση: ${title}`,
  portalNotifSubjectMany: (count: number) => `Έχετε ${count} νέες ενημερώσεις στις υποθέσεις σας`,
  portalNotifIntro: 'Τι νέο υπάρχει στις υποθέσεις σας:',
  portalNotifButton: 'Άνοιγμα πύλης πελατών',
  portalNotifWhy:
    'Λαμβάνετε αυτό το email επειδή παρακολουθείτε αυτές τις υποθέσεις στην πύλη πελατών. Μπορείτε να απενεργοποιήσετε αυτά τα email από το μενού ειδοποιήσεων της πύλης.',
};

export function emailTexts(lang: EmailLang): EmailTexts {
  return lang === 'el' ? el : en;
}
