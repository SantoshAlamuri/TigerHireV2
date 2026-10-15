/**
 * Pilot test cast — labels match one-click buttons on `/login` (LoginClient TEST_ACCOUNTS).
 */
export type PilotAccountKey =
  | "superAdmin"
  | "leadership"
  | "recruiter"
  | "hiringManager"
  | "employee"
  | "interviewer"
  | "finance"
  | "agency"
  | "candidatePro";

export interface PilotAccount {
  key: PilotAccountKey;
  email: string;
  /** Matches the visible label on the one-click login button. */
  buttonLabel: RegExp;
  expectedLanding: RegExp;
}

export const PILOT_ACCOUNTS: Record<PilotAccountKey, PilotAccount> = {
  superAdmin: {
    key: "superAdmin",
    email: "sam@tigerhire.io",
    buttonLabel: /super admin/i,
    expectedLanding: /\/admin/,
  },
  leadership: {
    key: "leadership",
    email: "nidhi.gupta@finstack.in",
    buttonLabel: /company admin/i,
    expectedLanding: /\/recruit\/v2\/portfolio/,
  },
  recruiter: {
    key: "recruiter",
    email: "rajiv.menon@finstack.in",
    buttonLabel: /recruiter/i,
    expectedLanding: /\/recruit\/jobs/,
  },
  hiringManager: {
    key: "hiringManager",
    email: "kavita.rao@finstack.in",
    buttonLabel: /hiring manager/i,
    expectedLanding: /\/company\/my-jobs/,
  },
  employee: {
    key: "employee",
    email: "meera.nair@finstack.in",
    buttonLabel: /employee/i,
    expectedLanding: /\/employee/,
  },
  interviewer: {
    key: "interviewer",
    email: "lakshmi.interviewer@finstack.in",
    buttonLabel: /interviewer/i,
    expectedLanding: /\/home/,
  },
  finance: {
    key: "finance",
    email: "lakshmi.finance@finstack.in",
    buttonLabel: /finance/i,
    expectedLanding: /\/home/,
  },
  agency: {
    key: "agency",
    email: "fatima.sheikh@talentbridge.co",
    buttonLabel: /agency/i,
    expectedLanding: /\/agency/,
  },
  candidatePro: {
    key: "candidatePro",
    email: "priya.sharma@gmail.com",
    buttonLabel: /candidate pro/i,
    expectedLanding: /\/candidate/,
  },
};
