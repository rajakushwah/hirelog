// Mirrors the Pydantic *Out models in backend/app/schemas.py. Change both together.

export type User = {
  user_id: string;
  name: string;
  email: string;
  profile_image?: string | null;
  created_at: string;
  has_password: boolean;
};

export type Application = {
  application_id: string;
  company_name: string;
  company_website: string;
  job_role: string;
  job_description: string;
  job_location: string;
  job_type: string;
  employment_type: string;
  applied_date: string;
  job_source: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  expected_ctc: string;
  offered_ctc: string;
  notice_period: string;
  application_status: string;
  offer_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationInput = Omit<Application, "application_id" | "offer_date" | "created_at" | "updated_at">;

export type Round = {
  round_id: string;
  application_id: string;
  company_name: string;
  job_role: string;
  round_number: number;
  round_name: string;
  interview_type: string;
  interview_types: string[];
  interview_date?: string | null;
  interview_time: string;
  duration: string;
  interviewer_name: string;
  interviewer_designation: string;
  interviewer_email: string;
  interview_platform: string;
  meeting_link: string;
  interview_status: string;
  interview_result: string;
  feedback: string;
  difficulty: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type RoundInput = Omit<Round, "round_id" | "company_name" | "job_role" | "interview_type" | "created_at" | "updated_at">;

export type Question = {
  question_id: string;
  round_id?: string | null;
  application_id?: string | null;
  question: string;
  answer: string;
  category: string;
  difficulty: string;
  tags: string[];
  notes: string;
  created_at: string;
  updated_at: string;
};

export type QuestionInput = Omit<Question, "question_id" | "created_at" | "updated_at">;

export type Attachment = {
  attachment_id: string;
  application_id: string;
  round_id: string;
  file_name: string;
  file_type: string;
  size: number;
  uploaded_at: string;
};

export type DashboardStats = {
  total_companies: number;
  total_applications: number;
  total_interviews_scheduled: number;
  interviews_completed: number;
  interviews_upcoming: number;
  offers: number;
  rejections: number;
  in_progress: number;
  total_questions: number;
  status_distribution: { status: string; count: number }[];
  applications_by_month: { month: string; count: number }[];
  rounds_by_company: { company: string; count: number }[];
  upcoming_rounds: Round[];
};

export type AuthConfig = { google_enabled: boolean; registration_enabled: boolean };

export type AndroidInfo = {
  available: boolean;
  version: string;
  min_android: string;
  size?: number | null;
  sha256: string;
  updated_at?: string | null;
  url: string;
  shared_account: boolean;
};
