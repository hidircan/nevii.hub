/**
 * İK / işe alım modülü — alan tipleri (store'dan bağımsız, UI + araçlar + testler ortak kullanır).
 * Tasarım: docs/implementation-plans/2026-09-28-ik-recruitment.md
 */

export type RecruitmentCategory = "teacher" | "staff";
export type JobStatus = "draft" | "published" | "closed" | "archived";
export type EmploymentType = "full_time" | "part_time" | "freelance" | "intern";
export type ApplicationStage =
  | "new"
  | "screening"
  | "interview"
  | "demo_lesson"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn"
  | "talent_pool";
export type EducationLevel =
  | ""
  | "high_school"
  | "conservatory_hs"
  | "associate"
  | "bachelor"
  | "master"
  | "doctorate";
export type ApplicationSource =
  | "linkedin"
  | "kariyer_net"
  | "website"
  | "instagram"
  | "referral"
  | "other";
export type InterviewKind = "interview" | "demo_lesson" | "phone" | "online";
export type InterviewStatus = "planned" | "completed" | "cancelled" | "no_show";
export type Recommendation = "strong_yes" | "yes" | "neutral" | "no" | "strong_no";
export type ActivityType = "note" | "stage_change" | "email" | "interview" | "evaluation" | "system";
export type EmailTemplateKind = "received" | "positive" | "negative" | "interview_invite" | "offer" | "custom";

export type RecruitmentJob = {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  category: RecruitmentCategory;
  instruments: string[];
  branchId: string | null;
  employmentType: EmploymentType;
  location: string;
  summary: string;
  description: string;
  requirements: string;
  benefits: string;
  status: JobStatus;
  publishedAt: string | null;
  closesAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationProfile = {
  birthYear?: number;
  school?: string;
  department?: string;
  graduationYear?: number;
  currentPosition?: string;
  currentEmployer?: string;
  skills?: string[];
  languages?: string[];
  availability?: string;
  availableFrom?: string;
  expectedSalary?: string;
  portfolioUrl?: string;
  linkedinUrl?: string;
  videoUrl?: string;
  coverLetter?: string;
  /** Pozisyona özel serbest cevaplar (soru → cevap). */
  answers?: Record<string, string>;
  utm?: Record<string, string>;
  referrer?: string;
  cvParse?: { method: "rules" | "ai"; parsedAt: string; fields: string[] };
};

export type RecruitmentApplication = {
  id: string;
  tenantId: string;
  seq: number;
  jobId: string | null;
  category: RecruitmentCategory;
  stage: ApplicationStage;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  instruments: string[];
  experienceYears: number | null;
  teachingYears: number | null;
  educationLevel: EducationLevel;
  source: ApplicationSource;
  tags: string[];
  ratingAvg: number | null;
  profile: ApplicationProfile;
  cvFileId: string | null;
  kvkkConsentAt: string | null;
  kvkkTextVersion: string;
  retentionUntil: string | null;
  anonymizedAt: string | null;
  hiredTeacherId: string | null;
  hiredStaffId: string | null;
  lastStageChangeAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentFileMeta = {
  id: string;
  tenantId: string;
  applicationId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type RecruitmentActivity = {
  id: string;
  tenantId: string;
  applicationId: string;
  type: ActivityType;
  body: string;
  meta: Record<string, unknown> | null;
  actorUserId: string | null;
  actorName: string;
  createdAt: string;
};

export type RecruitmentInterview = {
  id: string;
  tenantId: string;
  applicationId: string;
  kind: InterviewKind;
  scheduledAt: string;
  durationMinutes: number;
  location: string;
  interviewers: string;
  status: InterviewStatus;
  notes: string;
  invitationSentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentEvaluation = {
  id: string;
  tenantId: string;
  applicationId: string;
  interviewId: string | null;
  evaluatorId: string | null;
  evaluatorName: string;
  scores: Record<string, number>;
  overall: number;
  recommendation: Recommendation;
  comment: string;
  createdAt: string;
};

export type RecruitmentEmailTemplate = {
  id: string;
  tenantId: string;
  kind: EmailTemplateKind;
  name: string;
  subject: string;
  body: string;
  active: boolean;
  systemKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScorecardCriterion = { key: string; label: string };

export type RecruitmentSettings = {
  tenantId: string;
  careerPageEnabled: boolean;
  careerPageIntro: string;
  kvkkText: string;
  kvkkTextVersion: string;
  notifyInApp: boolean;
  notifyEmails: string[];
  autoAcknowledge: boolean;
  retentionMonths: number;
  scorecardCriteria: ScorecardCriterion[];
  updatedBy: string | null;
  updatedAt: string;
};
