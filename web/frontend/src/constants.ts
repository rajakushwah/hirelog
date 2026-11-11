export const APPLICATION_STATUSES = [
  "Interested",
  "Applied",
  "Recruiter Screening",
  "Interview Scheduled",
  "Interview In Progress",
  "Offer Received",
  "Offer Accepted",
  "Rejected",
  "On Hold",
  "Withdrawn",
] as const;

export const JOB_TYPES = ["Full-time", "Contract", "Remote", "Hybrid", "Part-time"] as const;
export const JOB_SOURCES = ["LinkedIn", "Naukri", "Referral", "Company Website", "Recruiter", "Other"] as const;

export const INTERVIEW_TYPES = ["Technical", "Coding", "System Design", "Behavioral", "AI", "Managerial", "HR", "Other"] as const;
export const INTERVIEW_PLATFORMS = ["Google Meet", "Zoom", "Teams", "Phone", "In-person"] as const;
export const INTERVIEW_STATUSES = ["Scheduled", "Completed", "Rescheduled", "Cancelled"] as const;
export const INTERVIEW_RESULTS = ["Passed", "Failed", "Pending"] as const;

export const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"] as const;

export const QUESTION_CATEGORIES = [
  "Python",
  "Golang",
  "SQL",
  "Data Structures and Algorithms",
  "System Design",
  "Kubernetes",
  "Networking",
  "Linux",
  "Cloud",
  "DevOps",
  "Behavioral",
  "HR",
  "Other",
] as const;

export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,video/mp4,video/quicktime,video/webm,application/pdf,.docx,.xlsx,.pptx,.txt,.md,.csv";

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
