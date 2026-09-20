/** Backend REST v1 yanıtlarının mobilde kullanılan ortak tipleri — tek yerden yönetilir. */

export type NotificationCategory = string;

export type Notification = {
  id: string;
  title?: string;
  body?: string;
  category?: NotificationCategory;
  readAt?: string | null;
  createdAt?: string;
};
export type NotificationsResponse = {
  notifications: Notification[];
  nextCursor?: string | null;
  unreadCount?: number;
};

export type AnnouncementAudienceType = "all" | "branch" | "teachers" | "parents" | "students" | "studentType" | "selected";
export type AnnouncementStatus = "draft" | "published" | "archived";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  pinned: boolean;
  audienceType: AnnouncementAudienceType;
  status: AnnouncementStatus;
};
export type AnnouncementsResponse = { announcements: Announcement[] };

export type LessonStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";

export type Lesson = {
  id: string;
  studentId?: string;
  studentName?: string;
  teacherId?: string;
  teacherName?: string;
  instrument?: string;
  roomName?: string;
  branchName?: string;
  startAt: string;
  endAt: string;
  status: LessonStatus;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  studentAttended?: boolean | null;
  studentAbsent?: boolean | null;
  studentExcused?: boolean | null;
  lessonProcessed?: boolean | null;
  opsMakeupFlag?: boolean | null;
  homeworkAssigned?: boolean;
};
export type ScheduleResponse = { lessons: Lesson[]; term?: "guz" | "yaz"; weeklyClosedDays?: number[] };
export type LessonsResponse = { lessons: Lesson[] };

export type AttendanceDayStatus = {
  date: string;
  status: "open" | "closed";
  reason: "manual_open" | "manual_closed" | "official_holiday" | "term_weekly_closed" | "open";
  label: string;
  lessonIds: string[];
};
export type AttendanceCalendarMonthResponse = {
  year: number;
  month: number;
  term: "guz" | "yaz";
  withinTerm: boolean;
  days: AttendanceDayStatus[];
};

export type Homework = {
  id: string;
  title: string;
  description?: string;
  studentId?: string;
  studentName?: string;
  lessonId?: string;
  dueDate?: string;
  createdAt?: string;
  status?: "PENDING" | "SUBMITTED" | "REVIEWED" | string;
};
export type HomeworkResponse = { homework: Homework[] };

export type HomeworkReportResponse = {
  totalCount: number;
  submittedCount: number;
  pendingCount: number;
  overdueCount: number;
  reviewedCount: number;
  byTeacher: Array<{ teacherId: string; teacherName: string; assignedCount: number; submittedCount: number }>;
};

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | string;
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED" | "ARCHIVED" | string;

export type TaskItem = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  dueDate?: string | null;
  assigneeId?: string;
  assigneeName?: string;
};
export type TasksResponse = { tasks: TaskItem[] };
export type TaskKpiSummary = {
  openCount: number;
  assignedToMeCount: number;
  dueTodayCount: number;
  overdueCount: number;
  completedThisWeekCount: number;
};

export type TeacherSummary = {
  id: string;
  name: string;
  instruments: string[];
  activeStudentCount: number;
  performanceScore: number | null;
  performanceLabel: "insufficient_data" | "scored";
  phone: string;
  email: string;
};
export type TeachersResponse = { teachers: TeacherSummary[] };

export type TeacherStudentSummary = {
  id: string;
  name: string;
  instruments: string[];
  nextLessonAt: string | null;
  homeworkPendingCount: number;
  studentType?: string;
  /** 0-100, null = yetersiz veri (bkz. src/lib/student-score.ts) — punitif bir 0 DEĞİL. */
  score: number | null;
  photoPath: string | null;
};
export type TeacherStudentsResponse = { students: TeacherStudentSummary[] };

export type AdminStudentSummary = {
  id: string;
  name: string;
  instruments: string[];
  teacherId: string;
  teacherName?: string;
  active: boolean;
  parentName: string;
  parentPhone: string;
};
export type AdminStudentsResponse = { students: AdminStudentSummary[] };

export type StudentProfile = {
  id: string;
  name: string;
  instruments: string[];
  teacherId: string;
  teacherName?: string;
  packageName: string;
  weeklyLessonCount: number;
  phone: string;
  parentName: string;
  parentPhone: string;
  communicationOptOut: boolean;
  studentType?: string;
  photoPath: string | null;
};

export type StudentScoreComponentView = {
  weight: number;
  hasData: boolean;
  normalizedValue: number | null;
  contribution: number | null;
};
export type StudentScoreResponse = {
  score: number | null;
  periodStart: string;
  periodEnd: string;
  components: {
    attendance: StudentScoreComponentView & { attendedCount: number; absentCount: number };
    homework: StudentScoreComponentView & { completedCount: number; totalCount: number; onTimeCount: number };
    curriculum: StudentScoreComponentView & { topicCount: number; masteredCount: number };
    teacherAssessment: StudentScoreComponentView & { assessmentCount: number };
  };
};

export type StudentSummary = {
  id: string;
  name: string;
  instrument?: string;
  level?: string;
  active?: boolean;
  nextLessonAt?: string | null;
  homeworkPendingCount?: number;
  studentType?: string;
  score?: number | null;
  photoPath?: string | null;
};
export type StudentsResponse = { students: StudentSummary[] };

export type AttendanceSummary = {
  studentId: string;
  totalLessons: number;
  attended: number;
  absent: number;
  excused: number;
  makeup: number;
  pending: number;
};

export type AdminDashboardSummary = {
  upcomingLessonCount: number;
  pendingAttendanceCount: number;
  overdueTaskCount: number;
  followUpNeededCount: number;
  attentionItems: Array<{ id: string; kind: string; label: string; detail?: string }>;
  topTeachers: Array<{ teacherId: string; teacherName: string; score: number | null; insufficientData: boolean }>;
};

export type CurriculumTopicStatus = "planned" | "in_progress" | "mastered" | "deferred";
export type CurriculumTopic = {
  id: string;
  title: string;
  description?: string;
  status: CurriculumTopicStatus;
  progressPercent: number;
  notes?: string;
  updatedAt?: string;
};
export type CurriculumResponse = { topics: CurriculumTopic[]; overallPercent: number; progressExplanation: string };

export type Assessment = {
  id: string;
  strengthNote: string;
  nextStepsNote: string;
  improvementNote: string;
  teacherSignedName: string;
  createdAt: string;
};
export type AssessmentsResponse = { assessments: Assessment[] };

export type TeacherFeedbackScores = {
  clarity: number;
  communication: number;
  effectiveness: number;
  motivation: number;
  punctuality: number;
};

export type TeacherFeedbackSummary = {
  responseCount: number;
  eligible: boolean;
  criteriaAverages: TeacherFeedbackScores | null;
  continueDistribution: { yes: number; unsure: number; no: number } | null;
  sharedComments: string[];
};

export type TeachingMaterial = {
  id: string;
  title: string;
  description: string;
  targetInstrument?: string;
  targetLevel?: string;
  fileName?: string;
  fileMimeType?: string;
  createdAt: string;
};
export type TeachingMaterialsResponse = { materials: TeachingMaterial[] };

export type MakeupStatus = string;
export type MakeupSlot = { startAt: string; endAt: string; teacherId: string; roomId: string; branchId: string; score: number; reasons: string[] };
export type MakeupRequest = {
  id: string;
  studentId: string;
  studentName?: string;
  teacherId: string;
  teacherName?: string;
  instrument?: string;
  sourceLessonId: string;
  status: MakeupStatus;
  reason: string;
  expiresAt: string;
  policyNote?: string;
  confirmedLessonId?: string;
  /** Sunucu ders kaydından (yoksa alan gelmez). */
  sourceLessonStartAt?: string;
  confirmedLessonStartAt?: string;
  createdAt: string;
  suggestedSlots: MakeupSlot[];
};
/** GET /api/v1/makeup — kapsam oturumdan (öğretmen: kendi; öğrenci/veli: bağlı öğrenci). */
export type MakeupResponse = { makeupRequests: MakeupRequest[] };

export type Payment = {
  id: string;
  studentId: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  paidAt?: string;
  description: string;
  method?: string;
  lessonId?: string;
  receiptAvailable: boolean;
};
export type BalanceResponse = { studentId: string; payments: Payment[]; outstanding: number };

export type StudentContractSummary = {
  id: string;
  studentId: string;
  contractNumber: string;
  versionNumber: number;
  contractType: "initial" | "renewal" | "amendment";
  status: string;
  programmeName: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  durationMonths: number;
  monthlyAmount: number;
  installmentCount: number;
  totalContractAmount: number;
  documentInstanceId?: string;
  signedAt?: string;
  createdAt: string;
};
export type StudentContractsResponse = { studentId: string; contracts: StudentContractSummary[] };

export type ContractInstallment = {
  paymentId: string;
  sequence: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  paidAt?: string;
  paymentMethod?: string;
  periodLabel?: string;
};
export type StudentContractDetailResponse = {
  contract: StudentContractSummary & { signatoryFullName: string; depositAmount?: number; paymentMethod?: string };
  installments: ContractInstallment[];
};

export type PaymentReceipt = {
  reference: string;
  institutionName: string;
  branchName?: string;
  studentName: string;
  parentLine?: string;
  description: string;
  amount: number;
  paymentDateIso: string;
  method?: string;
};
export type PaymentReceiptResponse = { eligible: boolean; ineligibleReason?: string; receipt?: PaymentReceipt };
/** POST /api/v1/mobile/payments/:id/checkout — başarıda hosted checkout URL'i; sağlayıcı kapalıysa 409 CONFLICT. */
export type PaymentCheckoutResponse = { checkoutUrl: string };

export type RoomSummary = { id: string; name: string; branchId: string; capacity: number; instruments: string[]; active: boolean };
export type RoomsResponse = { rooms: RoomSummary[] };

export type BranchSummary = { id: string; name: string; shortName: string; address: string; phone: string; city: string };
export type BranchesResponse = { branches: BranchSummary[] };

export type TeacherPayout = {
  id: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  totalAmount: number;
  status: "pending" | "paid";
  paidAt?: string;
  method?: string;
  generatedAt: string;
};
export type PayoutsResponse = { payouts: TeacherPayout[] };

export type AvailabilityWindow = { dayOfWeek: number; start: string; end: string; branchId?: string };
export type AvailabilityRequest = {
  id: string;
  teacherId: string;
  proposedAvailability: AvailabilityWindow[];
  status: "pending" | "approved" | "rejected" | string;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
};
export type AvailabilityRequestsResponse = { requests: AvailabilityRequest[]; currentAvailability: AvailabilityWindow[] };

export type WorkflowSummary = {
  id: string;
  name: string;
  description?: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt?: string;
  lastSuccess?: boolean;
  lastError?: string;
  runCount: number;
};
export type WorkflowsResponse = { workflows: WorkflowSummary[]; runs: unknown[] };

export type FollowUpCase = {
  id: string;
  paymentId: string;
  studentId: string;
  status: "draft" | "approved" | "sent" | "replied" | "paid" | "lost";
  messageDraft: string;
  attributedAmount: number;
  createdAt: string;
  updatedAt: string;
};
export type FollowUpCasesResponse = { cases: FollowUpCase[]; roi?: unknown };

export type InstrumentCatalogEntry = { id: string; name: string; status: "active" | "archived" };
export type InstrumentsResponse = { entries: InstrumentCatalogEntry[]; staticInstruments: string[] };

export type TeacherFeedbackEntry = {
  id: string;
  teacherId: string;
  submitterRole: string;
  scores: TeacherFeedbackScores;
  continueWithTeacher?: "yes" | "unsure" | "no";
  comment?: string;
  status: "pending" | "reviewed" | "actioned" | "archived";
  sharedWithTeacher: boolean;
  createdAt: string;
};
export type TeacherFeedbackReviewResponse = { feedback: TeacherFeedbackEntry[] };

export type StudentDocument = { id: string; kind: string; reference: string; status: string; createdAt: string };
export type StudentDocumentsResponse = { documents: StudentDocument[] };

/** GET /api/v1/teachers/:teacherId/performance-v2 — 4 bileşenli genişletilmiş performans raporu. */
export type PerformanceComponentV2 = {
  weight: number;
  hasData: boolean;
  rawValue: number | null;
  normalizedValue: number | null;
  contribution: number | null;
};
export type TeacherPerformanceV2Response = {
  version: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  components: {
    attendance: PerformanceComponentV2 & {
      plannedLessonCount: number;
      attendedCount: number;
      absentCount: number;
      excusedCount: number;
      pendingCount: number;
    };
    feedback: PerformanceComponentV2 & {
      responseCount: number;
      eligible: boolean;
    };
    tasks: PerformanceComponentV2 & {
      totalAssigned: number;
      completedCount: number;
      openCount: number;
      overdueCount: number;
      onTimeCount: number;
      completionRate: number | null;
      onTimeRate: number | null;
    };
    homework: PerformanceComponentV2 & {
      eligibleLessonCount: number;
      assignedCount: number;
      notAssignedCount: number;
      submittedCount: number;
      reviewedCount: number;
    };
  };
};

export type SocialMediaConsentStatus = "granted" | "denied" | "withdrawn" | "expired";
export type SocialMediaConsent = {
  id: string;
  studentId: string;
  status: SocialMediaConsentStatus;
  representativeName: string;
  relationship: string;
  grantedAt: string;
  scopes: string[];
  sourceDocumentRef?: string;
  withdrawnAt?: string;
};
export type SocialMediaConsentResponse = { consent: SocialMediaConsent | null };

export type LessonReassignScope = "single" | "fromHereOnward" | "entireSeries";
export type LessonReassignResponse = {
  affectedLessonIds: string[];
  newTeacherId: string;
  newBranchId: string;
  newRoomId: string;
};
