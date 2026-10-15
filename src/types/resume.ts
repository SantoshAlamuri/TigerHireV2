/** Resume version (API returns view_url for private bucket access). */
export interface ResumeVersion {
  id: string;
  candidate_id: string;
  file_url: string;
  file_name: string;
  file_size?: number | null;
  is_default: boolean;
  label?: string | null;
  created_at: string;
  /** Prefer this for opening/downloading; signed URL when bucket is private */
  view_url?: string;
  storage_path?: string | null;
}
