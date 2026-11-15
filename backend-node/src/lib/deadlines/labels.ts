// Greek reference labels (wording follows lawcase.gr). The UI translates from `key` itself;
// these exist for reference and tests.
import type { DeadlineRules } from './engine.js';

export const LABELS_EL: Record<DeadlineRules, Record<string, string>> = {
  gr_ordinary: {
    service: 'Επίδοση αγωγής',
    interventions: 'Άσκηση και επίδοση παρέμβασης, προσεπίκλησης, ανακοίνωσης ή ανταγωγής',
    interventionAfterNotice: 'Παρέμβαση του προσεπικαλούμενου',
    pleadings: 'Κατάθεση προτάσεων',
    addendum: 'Κατάθεση προσθήκης-αντίκρουσης',
    judgeAssignment: 'Ορισμός δικαστή',
    preliminaryOrder: 'Έκδοση διάταξης (προδικαστικής)',
    hearingRequest: 'Αίτηση του ενάγοντος για εκδίκαση της υπόθεσης',
    vaguenessCompletion: 'Συμπλήρωση αοριστίας αγωγής',
    vaguenessRebuttal: 'Αντίκρουση σε προτάσεις συμπλήρωσης αοριστίας',
    witnessEvaluation: 'Αξιολόγηση μαρτύρων/αυτοψίας/πραγματογνωμοσύνης',
    witnessExamination: 'Εξέταση μαρτύρων (σε εξαιρετικές περιπτώσεις)',
    finalJudgment: 'Έκδοση οριστικής απόφασης',
    resummons: 'Κλήση για επαναπροσδιορισμό μετά από ματαίωση',
    hearing: 'Δικάσιμος',
  },
  gr_small_claims: {
    service: 'Επίδοση αγωγής',
    evidenceAndMemo: 'Προσκομιδή αποδεικτικών και υπόμνημα εναγομένου',
    rebuttal: 'Κατάθεση προσθήκης-αντίκρουσης',
    interventions: 'Κατάθεση και επίδοση παρέμβασης και ανταγωγής',
    interventionEvidence: 'Προσκομιδή αποδεικτικών και υπόμνημα παρέμβασης ή ανταγωγής',
    interventionRebuttal: 'Κατάθεση προσθήκης επί της παρέμβασης ή της ανταγωγής',
    resummons: 'Κλήση για επαναπροσδιορισμό μετά από ματαίωση',
    hearing: 'Δικάσιμος',
  },
};
